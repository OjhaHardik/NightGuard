require("dotenv").config();

const { REST, Routes, SlashCommandBuilder, PermissionFlagsBits } = require("discord.js");

const { DISCORD_TOKEN, CLIENT_ID, GUILD_ID } = process.env;

const commands = [
    new SlashCommandBuilder()
        .setName("night")
        .setDescription("Control NightGuard's scheduled channel hiding")
        .setDefaultMemberPermissions(PermissionFlagsBits.ManageChannels)
        .addSubcommand(sub =>
            sub.setName("on").setDescription("Hide the night mode category now")
        )
        .addSubcommand(sub =>
            sub.setName("off").setDescription("Show the night mode category now")
        )
        .addSubcommand(sub =>
            sub.setName("status").setDescription("Show whether night mode is currently on")
        )
        .addSubcommand(sub =>
            sub.setName("schedule").setDescription("Show the configured hide/show schedule")
        )
].map(command => command.toJSON());

const rest = new REST().setToken(DISCORD_TOKEN);

(async () => {
    try {
        console.log("Registering slash commands...");

        await rest.put(
            Routes.applicationGuildCommands(CLIENT_ID, GUILD_ID),
            { body: commands }
        );

        console.log("Slash commands registered.");
    } catch (error) {
        console.error(error);
    }
})();
