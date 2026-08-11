require("dotenv").config();

const {
    Client,
    GatewayIntentBits,
    PermissionFlagsBits,
    PermissionsBitField
} = require("discord.js");

const cron = require("node-cron");

const client = new Client({
    intents: [GatewayIntentBits.Guilds]
});

const {
    DISCORD_TOKEN,
    GUILD_ID,
    CATEGORY_ID,
    HIDE_CRON,
    SHOW_CRON,
    TIMEZONE
} = process.env;

const hideCron = HIDE_CRON || "0 2 * * *";
const showCron = SHOW_CRON || "0 9 * * *";
const timezone = TIMEZONE || "Asia/Kolkata";

async function getCategory(guild) {
    const category = await guild.channels.fetch(CATEGORY_ID);
    if (!category) {
        throw new Error("Category not found — check CATEGORY_ID in .env");
    }
    return category;
}

async function isNightModeOn(guild) {
    const category = await getCategory(guild);
    const overwrite = category.permissionOverwrites.cache.get(guild.roles.everyone.id);
    return overwrite ? overwrite.deny.has(PermissionsBitField.Flags.ViewChannel) : false;
}

async function setNightMode(guild, on) {
    const category = await getCategory(guild);

    await category.permissionOverwrites.edit(guild.roles.everyone, {
        ViewChannel: on ? false : null
    });

    console.log(
        on
            ? "Night Mode ON — category hidden"
            : "Night Mode OFF — category visible"
    );
}

client.once("clientReady", async () => {
    console.log(`Logged in as ${client.user.tag}`);

    const guild = await client.guilds.fetch(GUILD_ID);
    console.log(`Connected to ${guild.name}`);

    cron.schedule(hideCron, async () => {
        try {
            await setNightMode(guild, true);
        } catch (error) {
            console.error(error);
        }
    }, { timezone });

    cron.schedule(showCron, async () => {
        try {
            await setNightMode(guild, false);
        } catch (error) {
            console.error(error);
        }
    }, { timezone });

    console.log(`Scheduled: hide "${hideCron}", show "${showCron}" (${timezone})`);
});

client.on("interactionCreate", async interaction => {
    if (!interaction.isChatInputCommand() || interaction.commandName !== "night") return;

    if (!interaction.memberPermissions?.has(PermissionFlagsBits.ManageChannels)) {
        await interaction.reply({ content: "You need Manage Channels permission to use this.", ephemeral: true });
        return;
    }

    const sub = interaction.options.getSubcommand();
    const guild = interaction.guild;

    try {
        if (sub === "on") {
            await setNightMode(guild, true);
            await interaction.reply("🌙 Night Mode is now **ON** — category hidden.");
        } else if (sub === "off") {
            await setNightMode(guild, false);
            await interaction.reply("☀️ Night Mode is now **OFF** — category visible.");
        } else if (sub === "status") {
            const on = await isNightModeOn(guild);
            await interaction.reply(`Night Mode is currently **${on ? "ON (hidden)" : "OFF (visible)"}**.`);
        } else if (sub === "schedule") {
            await interaction.reply(
                "🌙 **NightGuard**\n" +
                `Hide: \`${hideCron}\`\n` +
                `Show: \`${showCron}\`\n` +
                `Timezone: ${timezone}\n` +
                `Category: <#${CATEGORY_ID}>`
            );
        }
    } catch (error) {
        console.error(error);
        await interaction.reply({ content: `Something went wrong: ${error.message}`, ephemeral: true });
    }
});

client.login(DISCORD_TOKEN);
