import {
Client,
GatewayIntentBits,
Partials,
EmbedBuilder,
ActionRowBuilder,
ButtonBuilder,
ButtonStyle,
ModalBuilder,
TextInputBuilder,
TextInputStyle,
Events
} from "discord.js";

import db from "./database.js";

const client = new Client({
intents: [
GatewayIntentBits.Guilds,
GatewayIntentBits.GuildMessages,
GatewayIntentBits.MessageContent
],
partials: [Partials.Channel]
});

const TOKEN = process.env.TOKEN;

client.once("ready", () => {
console.log(`${client.user.tag} online`);
});

client.on("messageCreate", async (message) => {

if (message.author.bot) return;

const canaisPermitidos = [
"insta-girls",
"insta-boys"
];

if (!canaisPermitidos.includes(message.channel.name)) return;

/* ================= PERMISSÃO POR CARGO ================= */

const member = await message.guild.members.fetch(message.author.id);

const isMan = member.roles.cache.some(role => role.name === "insta-man");
const isGirl = member.roles.cache.some(role => role.name === "insta-girls");

/* regra por canal */
if (message.channel.name === "insta-girls" && !isGirl) {
return message.reply("❌ Só quem tem o cargo insta-girls pode postar aqui.");
}

if (message.channel.name === "insta-boys" && !isMan) {
return message.reply("❌ Só quem tem o cargo insta-man pode postar aqui.");
}

/* ================= VERIFICA IMAGEM ================= */

if (!message.attachments.size) return;

const imagem = message.attachments.first();

/* ================= EMBED ================= */

const embed = new EmbedBuilder()
.setAuthor({
name: message.author.username,
iconURL: message.author.displayAvatarURL()
})
.setImage(imagem.url)
.setColor("#ff00ff")
.setFooter({
text: "Instagram Discord"
});

/* ================= BOTÕES ================= */

const row = new ActionRowBuilder().addComponents(
new ButtonBuilder()
.setCustomId("like")
.setEmoji("❤️")
.setLabel("0")
.setStyle(ButtonStyle.Secondary),

new ButtonBuilder()
.setCustomId("comment")
.setEmoji("💬")
.setStyle(ButtonStyle.Primary),

new ButtonBuilder()
.setCustomId("delete")
.setEmoji("🗑️")
.setStyle(ButtonStyle.Danger)
);

/* ================= ENVIA POST ================= */

const post = await message.channel.send({
embeds: [embed],
components: [row]
});

/* salva no banco */
db.run(
"INSERT INTO posts(id, author, likes) VALUES(?,?,?)",
[post.id, message.author.id, 0]
);

await message.delete().catch(() => {});
});

/* ================= INTERAÇÕES ================= */

client.on(Events.InteractionCreate, async interaction => {

if (interaction.isButton()) {

/* ===== LIKE ===== */
if (interaction.customId === "like") {

db.get(
"SELECT * FROM posts WHERE id=?",
[interaction.message.id],
async (err, rowData) => {

if (!rowData) return;

const likes = rowData.likes + 1;

db.run(
"UPDATE posts SET likes=? WHERE id=?",
[likes, interaction.message.id]
);

const row = new ActionRowBuilder().addComponents(
new ButtonBuilder()
.setCustomId("like")
.setEmoji("❤️")
.setLabel(`${likes}`)
.setStyle(ButtonStyle.Secondary),

new ButtonBuilder()
.setCustomId("comment")
.setEmoji("💬")
.setStyle(ButtonStyle.Primary),

new ButtonBuilder()
.setCustomId("delete")
.setEmoji("🗑️")
.setStyle(ButtonStyle.Danger)
);

await interaction.update({
components: [row]
});
});
}

/* ===== COMMENT ===== */
if (interaction.customId === "comment") {

const modal = new ModalBuilder()
.setCustomId("commentModal")
.setTitle("Comentar");

const comentario = new TextInputBuilder()
.setCustomId("texto")
.setLabel("Comentário")
.setStyle(TextInputStyle.Paragraph);

const row = new ActionRowBuilder().addComponents(comentario);

modal.addComponents(row);

await interaction.showModal(modal);
}

/* ===== DELETE (AUTOR OU ADMIN) ===== */
if (interaction.customId === "delete") {

const member = await interaction.guild.members.fetch(interaction.user.id);

const isAdmin = member.permissions.has("Administrator");

db.get(
"SELECT author FROM posts WHERE id=?",
[interaction.message.id],
async (err, row) => {

if (!row) return;

const isAuthor = row.author === interaction.user.id;

if (!isAuthor && !isAdmin) {
return interaction.reply({
content: "❌ Somente o autor ou administradores podem excluir.",
ephemeral: true
});
}

await interaction.message.delete();
db.run("DELETE FROM posts WHERE id=?", [interaction.message.id]);
}
);
}
}

/* ===== MODAL COMMENT ===== */
if (interaction.isModalSubmit()) {

if (interaction.customId === "commentModal") {

const texto = interaction.fields.getTextInputValue("texto");

await interaction.reply({
content: `💬 ${interaction.user}: ${texto}`
});
}
}
});

client.login(TOKEN);
