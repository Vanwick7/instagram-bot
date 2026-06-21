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

/* ================= EXTENSÕES DE VÍDEO ACEITAS ================= */
const EXTENSOES_VIDEO = [
    ".mp4",
    ".mov",
    ".webm",
    ".mkv",
    ".avi",
    ".m4v",
    ".3gp"
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

function ehVideo(attachment) {
    // 1) Tenta pelo contentType (mais confiável quando existe)
    if (
        attachment.contentType &&
        attachment.contentType.startsWith("video/")
    ) {
        return true;
    }

    // 2) Fallback: verifica pela extensão do nome do arquivo
    const nome = (attachment.name || "").toLowerCase();
    return EXTENSOES_VIDEO.some(ext => nome.endsWith(ext));
}

/* ================= HELPERS DE EMBED / BOTÕES ================= */

function montarBotoes(likes, comentariosCount) {
    return new ActionRowBuilder().addComponents(
        new ButtonBuilder()
            .setCustomId("like")
            .setEmoji("❤️")
            .setLabel(likes.toString())
            .setStyle(ButtonStyle.Secondary),

        new ButtonBuilder()
            .setCustomId("comment")
            .setEmoji("💬")
            .setLabel((comentariosCount || 0).toString())
            .setStyle(ButtonStyle.Primary),

        new ButtonBuilder()
            .setCustomId("delete")
            .setEmoji("🗑️")
            .setStyle(ButtonStyle.Danger)
    );
}

// Conta quantos comentários um post tem.
function contarComentarios(postId) {
    return new Promise((resolve) => {
        db.get(
            "SELECT COUNT(*) AS total FROM post_comments WHERE post_id=?",
            [postId],
            (err, row) => {
                resolve(row ? row.total : 0);
            }
        );
    });
}

// Busca os comentários de um post formatados para exibição
// na janela efêmera (visível só para quem clicou no botão).
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
            "1515907195957416148", // 💅🏻᭝insta-girls
            "1515909078571028550"  // 🧢᭝insta-man
        ];

        if (!canaisPermitidos.includes(message.channel.id))
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

        // Log de diagnóstico: mostra nos logs do Railway quais cargos
        // o bot está enxergando para esse usuário, pra facilitar
        // identificar problemas de permissão.
        console.log(
            `[DIAGNÓSTICO] Usuário: ${message.author.tag} | Canal: ${message.channel.name} | Cargos: [${member.roles.cache.map(r => r.name).join(", ")}] | isMan: ${isMan} | isGirl: ${isGirl}`
        );

        if (
            message.channel.id === "1515907195957416148" &&
            !isGirl
        ) {
            const aviso = await message.channel.send({
                content: `${message.author} ❌ Apenas membros com o cargo insta-girls podem postar no canal insta-girls.`
            });
            setTimeout(() => aviso.delete().catch(() => {}), 6000);
            await message.delete().catch(() => {});
            return;
        }

        if (
            message.channel.id === "1515909078571028550" &&
            !isMan
        ) {
            const aviso = await message.channel.send({
                content: `${message.author} ❌ Apenas membros com o cargo insta-man podem postar no canal insta-man.`
            });
            setTimeout(() => aviso.delete().catch(() => {}), 6000);
            await message.delete().catch(() => {});
            return;
        }

        if (!message.attachments.size) {
            const aviso = await message.reply({
                content: "❌ Envie uma imagem ou vídeo."
            });
            setTimeout(() => aviso.delete().catch(() => {}), 5000);
            await message.delete().catch(() => {});
            return;
        }

        const midia = message.attachments.first();
        const tipoImagem = ehImagem(midia);
        const tipoVideo = ehVideo(midia);

        if (!tipoImagem && !tipoVideo) {
            const aviso = await message.reply({
                content: "❌ Apenas imagens (png, jpg, jpeg, gif, webp, bmp, heic, etc) ou vídeos (mp4, mov, webm, etc) são permitidos."
            });
            setTimeout(() => aviso.delete().catch(() => {}), 5000);
            await message.delete().catch(() => {});
            return;
        }

        // ===== Baixa a mídia e reenvia como anexo novo =====
        // Isso evita o bug do conteúdo "sumir" depois de um tempo,
        // já que a URL original do attachment do Discord expira.
        let attachmentFile;
        try {
            const resposta = await fetch(midia.url);
            const arrayBuffer = await resposta.arrayBuffer();
            const buffer = Buffer.from(arrayBuffer);

            attachmentFile = new AttachmentBuilder(buffer, {
                name: midia.name || (tipoVideo ? "video.mp4" : "imagem.png")
            });
        } catch (downloadError) {
            console.error("Erro ao baixar mídia:", downloadError);
            const aviso = await message.reply({
                content: "❌ Não foi possível processar o arquivo, tente novamente."
            });
            setTimeout(() => aviso.delete().catch(() => {}), 5000);
            await message.delete().catch(() => {});
            return;
        }

        const nomeArquivo = attachmentFile.name;

        let embedsParaEnviar = [];

        // Vídeo não pode ir dentro do embed (Discord não suporta
        // vídeo em setImage/setThumbnail). Nesse caso, o vídeo vai
        // como anexo normal junto da mensagem. O Discord REJEITA
        // embeds totalmente vazios (erro 50035 Invalid Form Body),
        // então só anexamos um embed quando ele tem imagem (foto)
        // ou, futuramente, comentários.
        if (tipoImagem) {
            const embed = new EmbedBuilder()
                .setColor("#ff00ff")
                .setImage(`attachment://${nomeArquivo}`);

            embedsParaEnviar = [embed];
        }

        const buttons = montarBotoes(0, 0);

        const post = await message.channel.send({
            content: `**${message.author.username}**`,
            embeds: embedsParaEnviar,
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

                                const totalComentarios =
                                    await contarComentarios(postId);

                                const row = montarBotoes(
                                    totalLikes,
                                    totalComentarios
                                );

                                await interaction.update({
                                    components: [row]
                                });
                            }
                        );
                    }
                );
            }

            /* ===== VER COMENTÁRIOS (lista efêmera) ===== */

            if (
                interaction.isButton() &&
                interaction.customId === "comment"
            ) {
                const postId = interaction.message.id;

                const comentarios = await buscarComentarios(postId);

                const addButton =
                    new ActionRowBuilder().addComponents(
                        new ButtonBuilder()
                            .setCustomId(`addComment:${postId}`)
                            .setEmoji("✏️")
                            .setLabel("Adicionar comentário")
                            .setStyle(ButtonStyle.Primary)
                    );

                await interaction.reply({
                    content: comentarios
                        ? `💬 **Comentários:**\n\n${comentarios}`
                        : "💬 Ainda não há comentários neste post.",
                    components: [addButton],
                    ephemeral: true
                });
            }

            /* ===== ABRIR MODAL PARA ADICIONAR COMENTÁRIO ===== */

            if (
                interaction.isButton() &&
                interaction.customId.startsWith("addComment:")
            ) {
                const postId = interaction.customId.split(":")[1];

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

                            const postRow = await new Promise(
                                (resolve) => {
                                    db.get(
                                        "SELECT likes FROM posts WHERE id=?",
                                        [postId],
                                        (err2, row) =>
                                            resolve(row)
                                    );
                                }
                            );

                            const totalLikes = postRow
                                ? postRow.likes
                                : 0;
                            const totalComentarios =
                                await contarComentarios(postId);

                            const novosBotoes = montarBotoes(
                                totalLikes,
                                totalComentarios
                            );

                            await postMessage.edit({
                                components: [novosBotoes]
                            });

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