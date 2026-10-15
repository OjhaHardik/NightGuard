require("dotenv").config();

const fs = require("fs");
const path = require("path");

const { ChannelType, PermissionsBitField } = require("discord.js");

const { CATEGORY_IDS, CATEGORY_ID, EXCLUDE_CATEGORY_IDS } = process.env;

// IDs may be separated by commas, spaces or new lines
const parseIds = value => (value || "").replace(/["']/g, "").split(/[\s,]+/).filter(Boolean);

// "all" = every channel in the server; otherwise a comma-separated list of IDs
const categorySetting = (CATEGORY_IDS || CATEGORY_ID || "all").trim();
const excludedIds = new Set(parseIds(EXCLUDE_CATEGORY_IDS));

// Remembers each channel's original @everyone ViewChannel setting while night mode is on,
// so the morning restore puts back exactly what was there (private channels stay private)
const STATE_FILE = path.join(__dirname, "nightguard-state.json");

function loadState() {
    if (!fs.existsSync(STATE_FILE)) return null;
    return JSON.parse(fs.readFileSync(STATE_FILE, "utf8"));
}

function saveState(state) {
    fs.writeFileSync(STATE_FILE, JSON.stringify(state, null, 2));
}

function clearState() {
    if (fs.existsSync(STATE_FILE)) fs.unlinkSync(STATE_FILE);
}

function isNightModeOn() {
    const state = loadState();
    return state !== null && Object.keys(state).length > 0;
}

// The chosen categories plus every channel inside them (child channels keep their own
// permission overwrites, so hiding only the category does not hide them).
// With "all", channels that are not in any category are included too.
async function getTargetChannels(guild) {
    const channels = (await guild.channels.fetch()).filter(Boolean);
    const isAll = categorySetting.replace(/["']/g, "").toLowerCase() === "all";
    const wantedIds = new Set(parseIds(categorySetting));

    const categories = channels.filter(channel =>
        channel.type === ChannelType.GuildCategory &&
        (isAll || wantedIds.has(channel.id)) &&
        !excludedIds.has(channel.id)
    );
    const others = channels.filter(channel =>
        channel.type !== ChannelType.GuildCategory &&
        (isAll || categories.has(channel.parentId)) &&
        !excludedIds.has(channel.id) &&
        !excludedIds.has(channel.parentId)
    );

    const categoryCount = channels.filter(channel => channel.type === ChannelType.GuildCategory).size;
    console.log(
        `Server has ${channels.size} channels (${categoryCount} categories). ` +
        `CATEGORY_IDS="${categorySetting}" matched ${categories.size} categories, ${others.size} channels`
    );

    const targets = [...categories.values(), ...others.values()];
    if (targets.length === 0) {
        throw new Error(
            `Nothing to hide — CATEGORY_IDS="${categorySetting}" matched no channels. ` +
            'Set it to all, or to category IDs separated by commas (no quotes or names).'
        );
    }
    return targets;
}

function getViewState(channel, everyoneId) {
    const overwrite = channel.permissionOverwrites.cache.get(everyoneId);
    if (overwrite?.allow.has(PermissionsBitField.Flags.ViewChannel)) return "allow";
    if (overwrite?.deny.has(PermissionsBitField.Flags.ViewChannel)) return "deny";
    return "neutral";
}

// Returns { count, failed }: channels changed, and channels Discord refused to change
async function setNightMode(guild, on) {
    const everyone = guild.roles.everyone;

    if (on) {
        if (isNightModeOn()) {
            console.log("Night Mode already ON — skipping");
            return { count: 0, failed: 0 };
        }

        const targets = await getTargetChannels(guild);
        const state = {};
        for (const channel of targets) {
            state[channel.id] = getViewState(channel, everyone.id);
        }
        // Save before editing so a crash part-way through can still be restored
        saveState(state);

        let failed = 0;
        for (const channel of targets) {
            try {
                await channel.permissionOverwrites.edit(everyone, { ViewChannel: false });
            } catch (error) {
                failed++;
                console.error(`Failed to hide #${channel.name}:`, error.message);
            }
        }
        const hidden = targets.length - failed;

        // Kick people out of the hidden voice channels. Done after hiding so nobody can rejoin;
        // anyone who can still see the channel (admins, roles with access) stays connected.
        const targetIds = new Set(targets.map(channel => channel.id));
        let disconnected = 0;
        for (const voiceState of guild.voiceStates.cache.values()) {
            if (!targetIds.has(voiceState.channelId) || !voiceState.member) continue;
            if (voiceState.channel.permissionsFor(voiceState.member).has(PermissionsBitField.Flags.ViewChannel)) continue;
            try {
                await voiceState.disconnect();
                disconnected++;
            } catch (error) {
                failed++;
                console.error(`Failed to disconnect ${voiceState.member.user.tag}:`, error.message);
            }
        }

        console.log(`Night Mode ON — ${hidden} channels hidden, ${disconnected} disconnected from voice, ${failed} failed`);
        return { count: hidden, failed };
    }

    const state = loadState();
    if (!isNightModeOn()) {
        clearState();
        console.log("Night Mode already OFF — skipping");
        return { count: 0, failed: 0 };
    }

    const restoreValue = { allow: true, deny: false, neutral: null };
    const notRestored = {};
    let count = 0;
    for (const [channelId, original] of Object.entries(state)) {
        try {
            const channel = await guild.channels.fetch(channelId).catch(() => null);
            if (!channel) continue; // deleted overnight
            await channel.permissionOverwrites.edit(everyone, { ViewChannel: restoreValue[original] });
            count++;
        } catch (error) {
            notRestored[channelId] = original;
            console.error(`Failed to restore ${channelId}:`, error.message);
        }
    }

    // Keep anything that failed so running "show" again retries it
    const failed = Object.keys(notRestored).length;
    if (failed) saveState(notRestored);
    else clearState();

    console.log(`Night Mode OFF — ${count} channels restored, ${failed} failed`);
    return { count, failed };
}

module.exports = { setNightMode };
