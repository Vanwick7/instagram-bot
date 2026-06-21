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

/* ================= HELPERS DE EMBED / BOTÕES ================= */

function montarBotoes(likes) {
    return new ActionRowBuilder().addComponents(
        new ButtonBuilder()
            .setCustomId("like")
            .setEmoji("❤️")
            .setLabel(likes.toString())
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
}

// Busca os comentários de um post e devolve um texto formatado
// pronto pra colocar dentro do embed.
function buscarComentarios(postId) {
    return new Promise((resolve) => {
        db.all(
            "SELECT username, texto FROM post_comments WHERE post_id=? ORDER BY id ASC",
            [postId],
            (err, rows) => {
                if (err || !rows || !rows.length) {
                    return resolve(null);
                }

                const texto = rows
                    .map(r => `**${r.username}:** ${r.texto}`)
                    .join("\n");

                resolve(texto);
            }
        );
    });
}

// Reconstrói o embed do zero (autor, imagem, cor, footer) e adiciona
// o campo de comentários (se houver), preservando a imagem original.
// IMPORTANTE: monta tudo manualmente (não usa EmbedBuilder.from) porque
// o Discord pode reordenar author/fields/image de forma estranha quando
// o embed é clonado, dando a impressão visual de "imagem duplicada".
// Também usa attachment://nomeDoArquivo (não a URL crua do CDN) porque
// referenciar a URL do CDN faz o Discord gerar um preview grande separado
// ALÉM do embed, dando a impressão de imagem duplicada.
async function montarEmbedAtualizado(embedAntigo, postId) {
    const novoEmbed = new EmbedBuilder()
        .setColor(embedAntigo.color)
        .setFooter(embedAntigo.footer);

    if (embedAntigo.author) {
        novoEmbed.setAuthor({
            name: embedAntigo.author.name,
            iconURL: embedAntigo.author.iconURL
        });
    }

    const comentarios = await buscarComentarios(postId);

    if (comentarios) {
        novoEmbed.addFields({
            name: "💬 Comentários",
            value: comentarios.slice(0, 1024) // limite do Discord por campo
        });
    }

    if (embedAntigo.image) {
        // Extrai o nome do arquivo a partir da URL do CDN
        // (ex: https://cdn.discordapp.com/.../foto123.png?ex=... -> foto123.png)
        const urlSemQuery = embedAntigo.image.url.split("?")[0];
        const nomeArquivo = urlSemQuery.split("/").pop();

        novoEmbed.setImage(`attachment://${nomeArquivo}`);
    }

    return novoEmbed;
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

        const buttons = montarBotoes(0);

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
            /* ===== LIKE (toggle: curtir/descurtir) ===== */

            if (
                interaction.isButton() &&
                interaction.customId === "like"
            ) {
                const postId = interaction.message.id;
                const userId = interaction.user.id;

                db.get(
                    "SELECT * FROM post_likes WHERE post_id=? AND user_id=?",
                    [postId, userId],
                    async (err, jaCurtiu) => {
                        if (jaCurtiu) {
                            // Já curtiu -> remove o like (descurtir)
                            db.run(
                                "DELETE FROM post_likes WHERE post_id=? AND user_id=?",
                                [postId, userId]
                            );
                        } else {
                            // Ainda não curtiu -> adiciona o like
                            db.run(
                                "INSERT INTO post_likes(post_id, user_id) VALUES(?,?)",
                                [postId, userId]
                            );
                        }

                        // Conta de novo quantos likes esse post tem, já refletindo a mudança
                        db.get(
                            "SELECT COUNT(*) AS total FROM post_likes WHERE post_id=?",
                            [postId],
                            async (err2, contagem) => {
                                const totalLikes = contagem
                                    ? contagem.total
                                    : 0;

                                db.run(
                                    "UPDATE posts SET likes=? WHERE id=?",
                                    [totalLikes, postId]
                                );

                                const row = montarBotoes(totalLikes);

                                await interaction.update({
                                    components: [row]
                                });
                            }
                        );
                    }
                );
            }

            /* ===== COMENTAR ===== */

            if (
                interaction.isButton() &&
                interaction.customId === "comment"
            ) {
                const postId = interaction.message.id;

                const modal =
                    new ModalBuilder()
                        .setCustomId(
                            `commentModal:${postId}`
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
                        db.run(
                            "DELETE FROM post_likes WHERE post_id=?",
                            [interaction.message.id]
                        );
                        db.run(
                            "DELETE FROM post_comments WHERE post_id=?",
                            [interaction.message.id]
                        );
                    }
                );
            }

            /* ===== ENVIO DO MODAL ===== */

            if (
                interaction.isModalSubmit() &&
                interaction.customId.startsWith(
                    "commentModal:"
                )
            ) {
                const postId = interaction.customId.split(":")[1];

                const texto =
                    interaction.fields.getTextInputValue(
                        "texto"
                    );

                db.run(
                    "INSERT INTO post_comments(post_id, user_id, username, texto, criado_em) VALUES(?,?,?,?,?)",
                    [
                        postId,
                        interaction.user.id,
                        interaction.user.username,
                        texto,
                        Date.now()
                    ],
                    async (err) => {
                        if (err) {
                            console.error(err);
                            return interaction.reply({
                                content: "❌ Não foi possível salvar o comentário.",
                                ephemeral: true
                            });
                        }

                        try {
                            const postMessage =
                                await interaction.channel.messages.fetch(
                                    postId
                                );

                            const embedAtual = postMessage.embeds[0];
                            const novoEmbed =
                                await montarEmbedAtualizado(
                                    embedAtual,
                                    postId
                                );

                            // Reaproveita o attachment original já anexado
                            // à mensagem (mesmo arquivo, sem precisar baixar
                            // de novo), pra manter a referência attachment://
                            // funcionando corretamente após o edit.
                            const anexoOriginal =
                                postMessage.attachments.first();

                            const editPayload = {
                                embeds: [novoEmbed]
                            };

                            if (anexoOriginal) {
                                editPayload.files = [anexoOriginal.url];
                            }

                            await postMessage.edit(editPayload);

                            await interaction.reply({
                                content: "✅ Comentário adicionado!",
                                ephemeral: true
                            });
                        } catch (editError) {
                            console.error(editError);
                            await interaction.reply({
                                content: "✅ Comentário salvo, mas não foi possível atualizar o post.",
                                ephemeral: true
                            });
                        }
                    }
                );
            }
        } catch (error) {
            console.error(error);
        }
    }
);

/* ================= LOGIN ================= */

client.login(TOKEN);