// Run-once entry point for GitHub Actions: logs in, hides or shows, then exits.
// Usage: node run.js hide | node run.js show

require("dotenv").config();

const { Client, GatewayIntentBits } = require("discord.js");
const { setNightMode } = require("./nightguard");

const { DISCORD_TOKEN, GUILD_ID } = process.env;
const action = process.argv[2];

if (action !== "hide" && action !== "show") {
    console.error('Usage: node run.js <hide|show>');
    process.exit(1);
}

const client = new Client({
    // GuildVoiceStates: to see who is in voice channels at closing time
    intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildVoiceStates]
});

client.once("clientReady", async () => {
    try {
        const guild = await client.guilds.fetch(GUILD_ID);
        console.log(`Connected to ${guild.name} — running "${action}"`);

        const { failed } = await setNightMode(guild, action === "hide");
        // Non-zero exit marks the workflow run as failed so GitHub emails you
        if (failed) process.exitCode = 1;
    } catch (error) {
        console.error(error);
        process.exitCode = 1;
    } finally {
        await client.destroy();
    }
});

client.login(DISCORD_TOKEN);
