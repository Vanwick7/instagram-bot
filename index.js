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
    Events,
    PermissionsBitField,
    AttachmentBuilder
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

if (!TOKEN) {
    console.error("❌ TOKEN não encontrada.");
    process.exit(1);
}

/* ================= ANTI-DUPLICAÇÃO ================= */
// Guarda os IDs de mensagens que já estão sendo processadas
// para evitar que o mesmo post seja criado duas vezes caso
// o evento MessageCreate dispare mais de uma vez para a mesma mensagem.
const mensagensProcessando = new Set();

/* ================= EXTENSÕES DE IMAGEM ACEITAS ================= */
// Fallback para quando o Discord não informa o contentType
// (acontece bastante em uploads do celular).
const EXTENSOES_IMAGEM = [
    ".png",
    ".jpg",
    ".jpeg",
    ".gif",
    ".webp",
    ".bmp",
    ".tiff",
    ".tif",
    ".heic",
    ".heif",
    ".avif",
    ".svg"
];

function ehImagem(attachment) {
    // 1) Tenta pelo contentType (mais confiável quando existe)
    if (
        attachment.contentType &&
        attachment.contentType.startsWith("image/")
    ) {
        return true;
    }

    // 2) Fallback: verifica pela extensão do nome do arquivo
    const nome = (attachment.name || "").toLowerCase();
    return EXTENSOES_IMAGEM.some(ext => nome.endsWith(ext));
}

/* ================= READY ================= */

client.once(Events.ClientReady, () => {
    console.log(`✅ ${client.user.tag} online`);
});

/* ================= NOVO POST ================= */

client.on(Events.MessageCreate, async (message) => {
    // Trava de duplicação: se essa mensagem já está sendo processada, ignora.
    if (mensagensProcessando.has(message.id)) return;
    mensagensProcessando.add(message.id);

    try {
        if (message.author.bot) return;
        if (!message.guild) return;

        const canaisPermitidos = [
            "insta-girls",
            "insta-man"
        ];

        if (!canaisPermitidos.includes(message.channel.name))
            return;

        const member = await message.guild.members.fetch(
            message.author.id
        );

        const isMan = member.roles.cache.some(
            role => role.name === "insta-man"
        );

        const isGirl = member.roles.cache.some(
            role => role.name === "insta-girls"
        );

        if (
            message.channel.name === "insta-girls" &&
            !isGirl
        ) {
            await message.delete().catch(() => {});
            return message.author.send({
                content:
                    "❌ Apenas membros com o cargo insta-girls podem postar no canal insta-girls."
            }).catch(() => {});
        }

        if (
            message.channel.name === "insta-man" &&
            !isMan
        ) {
            await message.delete().catch(() => {});
            return message.author.send({
                content:
                    "❌ Apenas membros com o cargo insta-man podem postar no canal insta-man."
            }).catch(() => {});
        }

        if (!message.attachments.size) {
            const aviso = await message.reply({
                content: "❌ Envie uma imagem."
            });
            setTimeout(() => aviso.delete().catch(() => {}), 5000);
            await message.delete().catch(() => {});
            return;
        }

        const imagem = message.attachments.first();

        if (!ehImagem(imagem)) {
            const aviso = await message.reply({
                content: "❌ Apenas imagens são permitidas (png, jpg, jpeg, gif, webp, bmp, heic, etc)."
            });
            setTimeout(() => aviso.delete().catch(() => {}), 5000);
            await message.delete().catch(() => {});
            return;
        }

        // ===== Baixa a imagem e reenvia como anexo novo =====
        // Isso evita o bug da imagem "sumir" depois de um tempo,
        // já que a URL original do attachment do Discord expira.
        let attachmentFile;
        try {
            const resposta = await fetch(imagem.url);
            const arrayBuffer = await resposta.arrayBuffer();
            const buffer = Buffer.from(arrayBuffer);

            attachmentFile = new AttachmentBuilder(buffer, {
                name: imagem.name || "imagem.png"
            });
        } catch (downloadError) {
            console.error("Erro ao baixar imagem:", downloadError);
            const aviso = await message.reply({
                content: "❌ Não foi possível processar a imagem, tente novamente."
            });
            setTimeout(() => aviso.delete().catch(() => {}), 5000);
            await message.delete().catch(() => {});
            return;
        }

        const nomeArquivo = attachmentFile.name;

        const embed = new EmbedBuilder()
            .setAuthor({
                name: message.author.username,
                iconURL:
                    message.author.displayAvatarURL()
            })
            .setImage(`attachment://${nomeArquivo}`)
            .setColor("#ff00ff")
            .setFooter({
                text: "Instagram Discord"
            });

        const buttons =
            new ActionRowBuilder().addComponents(
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

        const post = await message.channel.send({
            embeds: [embed],
            files: [attachmentFile],
            components: [buttons]
        });

        db.run(
            "INSERT INTO posts(id, author, likes) VALUES(?,?,?)",
            [post.id, message.author.id, 0]
        );

        await message.delete().catch(() => {});
    } catch (error) {
        console.error(error);
    } finally {
        // Libera o ID depois de processar, com uma pequena folga de segurança.
        setTimeout(() => mensagensProcessando.delete(message.id), 10000);
    }
});

/* ================= INTERAÇÕES ================= */

client.on(
    Events.InteractionCreate,
    async interaction => {
        try {
            /* ===== LIKE ===== */

            if (
                interaction.isButton() &&
                interaction.customId === "like"
            ) {
                db.get(
                    "SELECT * FROM posts WHERE id=?",
                    [interaction.message.id],
                    async (err, rowData) => {
                        if (!rowData) return;

                        const likes =
                            Number(rowData.likes) + 1;

                        db.run(
                            "UPDATE posts SET likes=? WHERE id=?",
                            [likes, interaction.message.id]
                        );

                        const row =
                            new ActionRowBuilder().addComponents(
                                new ButtonBuilder()
                                    .setCustomId("like")
                                    .setEmoji("❤️")
                                    .setLabel(
                                        likes.toString()
                                    )
                                    .setStyle(
                                        ButtonStyle.Secondary
                                    ),

                                new ButtonBuilder()
                                    .setCustomId(
                                        "comment"
                                    )
                                    .setEmoji("💬")
                                    .setStyle(
                                        ButtonStyle.Primary
                                    ),

                                new ButtonBuilder()
                                    .setCustomId(
                                        "delete"
                                    )
                                    .setEmoji("🗑️")
                                    .setStyle(
                                        ButtonStyle.Danger
                                    )
                            );

                        await interaction.update({
                            components: [row]
                        });
                    }
                );
            }

            /* ===== COMENTAR ===== */

            if (
                interaction.isButton() &&
                interaction.customId === "comment"
            ) {
                const modal =
                    new ModalBuilder()
                        .setCustomId(
                            "commentModal"
                        )
                        .setTitle("Comentar");

                const comentario =
                    new TextInputBuilder()
                        .setCustomId("texto")
                        .setLabel("Comentário")
                        .setStyle(
                            TextInputStyle.Paragraph
                        )
                        .setRequired(true);

                const row =
                    new ActionRowBuilder().addComponents(
                        comentario
                    );

                modal.addComponents(row);

                await interaction.showModal(
                    modal
                );
            }

            /* ===== EXCLUIR ===== */

            if (
                interaction.isButton() &&
                interaction.customId === "delete"
            ) {
                const member =
                    await interaction.guild.members.fetch(
                        interaction.user.id
                    );

                const isAdmin =
                    member.permissions.has(
                        PermissionsBitField.Flags
                            .Administrator
                    );

                db.get(
                    "SELECT author FROM posts WHERE id=?",
                    [interaction.message.id],
                    async (err, row) => {
                        if (!row) return;

                        const isAuthor =
                            row.author ===
                            interaction.user.id;

                        if (
                            !isAuthor &&
                            !isAdmin
                        ) {
                            return interaction.reply({
                                content:
                                    "❌ Apenas o autor ou administradores podem excluir.",
                                ephemeral: true
                            });
                        }

                        await interaction.message.delete();

                        db.run(
                            "DELETE FROM posts WHERE id=?",
                            [interaction.message.id]
                        );
                    }
                );
            }

            /* ===== ENVIO DO MODAL ===== */

            if (
                interaction.isModalSubmit() &&
                interaction.customId ===
                    "commentModal"
            ) {
                const texto =
                    interaction.fields.getTextInputValue(
                        "texto"
                    );

                await interaction.reply({
                    content: `💬 ${interaction.user}: ${texto}`
                });
            }
        } catch (error) {
            console.error(error);
        }
    }
);

/* ================= LOGIN ================= */

client.login(TOKEN);