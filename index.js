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
    PermissionsBitField
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

/* ================= READY ================= */

client.once(Events.ClientReady, () => {
    console.log(`✅ ${client.user.tag} online`);
});

/* ================= NOVO POST ================= */

client.on(Events.MessageCreate, async (message) => {
    try {
        if (message.author.bot) return;
        if (!message.guild) return;

        const canaisPermitidos = [
            "insta-girls",
            "insta-boys"
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
            return message.reply({
                content:
                    "❌ Apenas membros com o cargo insta-girls podem postar aqui."
            });
        }

        if (
            message.channel.name === "insta-boys" &&
            !isMan
        ) {
            return message.reply({
                content:
                    "❌ Apenas membros com o cargo insta-man podem postar aqui."
            });
        }

        if (!message.attachments.size) {
            return message.reply({
                content: "❌ Envie uma imagem."
            });
        }

        const imagem = message.attachments.first();

        if (
            !imagem.contentType ||
            !imagem.contentType.startsWith("image/")
        ) {
            return message.reply({
                content: "❌ Apenas imagens são permitidas."
            });
        }

        const embed = new EmbedBuilder()
            .setAuthor({
                name: message.author.username,
                iconURL:
                    message.author.displayAvatarURL()
            })
            .setImage(imagem.url)
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
            components: [buttons]
        });

        db.run(
            "INSERT INTO posts(id, author, likes) VALUES(?,?,?)",
            [post.id, message.author.id, 0]
        );

        await message.delete().catch(() => {});
    } catch (error) {
        console.error(error);
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
"SELECT * FROM post_likes WHERE post_id=? AND user_id=?",
[interaction.message.id, interaction.user.id],
async (err, liked) => {

```
        if (err) {
            console.error(err);
            return;
        }

        if (liked) {

            db.run(
                "DELETE FROM post_likes WHERE post_id=? AND user_id=?",
                [interaction.message.id, interaction.user.id]
            );

        } else {

            db.run(
                "INSERT INTO post_likes(post_id,user_id) VALUES(?,?)",
                [interaction.message.id, interaction.user.id]
            );

        }

        db.get(
            "SELECT COUNT(*) AS total FROM post_likes WHERE post_id=?",
            [interaction.message.id],
            async (err, result) => {

                const total = result?.total || 0;

                db.run(
                    "UPDATE posts SET likes=? WHERE id=?",
                    [total, interaction.message.id]
                );

                const row =
                    new ActionRowBuilder().addComponents(
                        new ButtonBuilder()
                            .setCustomId("like")
                            .setEmoji("❤️")
                            .setLabel(total.toString())
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
            }
        );
    }
);
```

}
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
