require('dotenv').config();

const {
  Client,
  GatewayIntentBits,
  Partials,
  EmbedBuilder,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  PermissionsBitField,
  ChannelType
} = require('discord.js');

const Database = require('better-sqlite3');

// ============================================================
// CONFIGURAÇÃO
// ============================================================

const PREFIX = '!';
const OWNER_ID = process.env.OWNER_ID;
const GUILD_ID = process.env.GUILD_ID;

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMembers,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent
  ],
  partials: [Partials.GuildMember]
});

const db = new Database('vip.sqlite');

// ============================================================
// BANCO DE DADOS
// ============================================================

db.exec(`
  CREATE TABLE IF NOT EXISTS vip_users (
    user_id TEXT PRIMARY KEY,
    role_id TEXT,
    channel_id TEXT,
    expires_at INTEGER,
    role_created_by_bot INTEGER DEFAULT 0,
    channel_created_by_bot INTEGER DEFAULT 0
  );

  CREATE TABLE IF NOT EXISTS panel_config (
    id INTEGER PRIMARY KEY CHECK (id = 1),
    title TEXT DEFAULT '👑 CENTRAL VIP',
    description TEXT DEFAULT 'Gerencie seus benefícios exclusivos de booster.',
    color TEXT DEFAULT '#8B5CF6',
    banner TEXT,
    thumbnail TEXT,
    footer TEXT DEFAULT 'Sistema VIP',
    footer_icon TEXT,
    button_1 TEXT DEFAULT '🎖️',
    button_2 TEXT DEFAULT '🔊',
    button_3 TEXT DEFAULT '🎨',
    button_4 TEXT DEFAULT '✨',
    button_5 TEXT DEFAULT '👥',
    button_6 TEXT DEFAULT '✏️'
  );
`);

const existingConfig = db
  .prepare('SELECT * FROM panel_config WHERE id = 1')
  .get();

if (!existingConfig) {
  db.prepare(`
    INSERT INTO panel_config (id)
    VALUES (1)
  `).run();
}

// ============================================================
// FUNÇÕES AUXILIARES
// ============================================================

function getConfig() {
  return db.prepare('SELECT * FROM panel_config WHERE id = 1').get();
}

function getVip(userId) {
  return db
    .prepare('SELECT * FROM vip_users WHERE user_id = ?')
    .get(userId);
}

function isOwner(userId) {
  return userId === OWNER_ID;
}

function isValidUrl(value) {
  try {
    new URL(value);
    return true;
  } catch {
    return false;
  }
}

function parseColor(color) {
  if (!color) return 0x8B5CF6;

  const cleaned = color.replace('#', '');

  if (!/^[0-9A-Fa-f]{6}$/.test(cleaned)) {
    return 0x8B5CF6;
  }

  return parseInt(cleaned, 16);
}

function formatDate(timestamp) {
  if (!timestamp) return 'Não definido';

  return `<t:${Math.floor(timestamp / 1000)}:F>`;
}

function vipStillActive(vip) {
  return vip && vip.expires_at && vip.expires_at > Date.now();
}

// ============================================================
// EMBED DO PAINEL
// ============================================================

function buildVipEmbed(userId, mode = 'edit') {
  const config = getConfig();

  const embed = new EmbedBuilder()
    .setTitle(config.title)
    .setDescription(config.description)
    .setColor(parseColor(config.color));

  if (config.banner && isValidUrl(config.banner)) {
    embed.setImage(config.banner);
  }

  if (config.thumbnail && isValidUrl(config.thumbnail)) {
    embed.setThumbnail(config.thumbnail);
  }

  if (config.footer) {
    embed.setFooter({
      text: config.footer,
      ...(config.footer_icon && isValidUrl(config.footer_icon)
        ? { iconURL: config.footer_icon }
        : {})
    });
  }

  const vip = getVip(userId);

  if (vip) {
    embed.addFields({
      name: '👑 Seu VIP',
      value:
        `**Status:** ${vipStillActive(vip) ? '🟢 Ativo' : '🔴 Expirado'}\n` +
        `**Validade:** ${formatDate(vip.expires_at)}`,
      inline: false
    });
  }

  return embed;
}

// ============================================================
// BOTÕES DO PAINEL
// ============================================================

function buildVipButtons(userId) {
  const config = getConfig();
  const vip = getVip(userId);

  const hasRole = Boolean(vip?.role_id);
  const hasChannel = Boolean(vip?.channel_id);

  const row1 = new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId('vip_role')
      .setLabel(hasRole ? 'Cargo' : 'Criar Cargo')
      .setEmoji(config.button_1 || '🎖️')
      .setStyle(ButtonStyle.Secondary),

    new ButtonBuilder()
      .setCustomId('vip_channel')
      .setLabel(hasChannel ? 'Canal' : 'Criar Canal')
      .setEmoji(config.button_2 || '🔊')
      .setStyle(ButtonStyle.Secondary),

    new ButtonBuilder()
      .setCustomId('vip_color')
      .setLabel('Cor')
      .setEmoji(config.button_3 || '🎨')
      .setStyle(ButtonStyle.Secondary)
  );

  const row2 = new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId('vip_emoji')
      .setLabel('Emoji')
      .setEmoji(config.button_4 || '✨')
      .setStyle(ButtonStyle.Secondary),

    new ButtonBuilder()
      .setCustomId('vip_limit')
      .setLabel('Limite')
      .setEmoji(config.button_5 || '👥')
      .setStyle(ButtonStyle.Secondary),

    new ButtonBuilder()
      .setCustomId('vip_name')
      .setLabel('Nome')
      .setEmoji(config.button_6 || '✏️')
      .setStyle(ButtonStyle.Secondary)
  );

  return [row1, row2];
}

// ============================================================
// VERIFICAÇÃO DE PROPRIEDADE
// ============================================================

function checkVipOwnership(interaction) {
  const vip = getVip(interaction.user.id);

  if (!vip) {
    return {
      ok: false,
      message: '❌ Você não possui um VIP registrado.'
    };
  }

  if (!vipStillActive(vip)) {
    return {
      ok: false,
      message: '⏳ Seu VIP está expirado.'
    };
  }

  return {
    ok: true,
    vip
  };
}

// ============================================================
// EVENTO READY
// ============================================================

client.once('ready', () => {
  console.log(`✅ Bot conectado como ${client.user.tag}`);
  console.log('👑 Sistema VIP iniciado.');
});

// ============================================================
// MENSAGENS
// ============================================================

client.on('messageCreate', async message => {
  if (message.author.bot) return;
  if (!message.guild) return;

  if (!message.content.startsWith(PREFIX)) return;

  const args = message.content.slice(PREFIX.length).trim().split(/\s+/);
  const command = args.shift()?.toLowerCase();

  // ==========================================================
  // !vip
  // ==========================================================

  if (command === 'vip') {
    const vip = getVip(message.author.id);

    if (!vip || !vipStillActive(vip)) {
      return message.reply(
        '❌ Você não possui um VIP ativo.'
      );
    }

    const embed = buildVipEmbed(message.author.id);
    const rows = buildVipButtons(message.author.id);

    return message.reply({
      embeds: [embed],
      components: rows
    });
  }

  // ==========================================================
  // !vincularvip @usuario
  // ==========================================================

  if (command === 'vincularvip') {
    if (!isOwner(message.author.id)) {
      return message.reply(
        '🔒 Somente a administração principal pode vincular VIPs.'
      );
    }

    const member = message.mentions.members.first();

    if (!member) {
      return message.reply(
        '❌ Use: `!vincularvip @usuario`'
      );
    }

    return message.reply(
      `📌 Para vincular o VIP de ${member}, responda esta mensagem informando:\n` +
      `\`CARGO_ID CALL_ID\`\n\n` +
      `Exemplo:\n` +
      `\`123456789012345678 987654321098765432\``
    );
  }

  // ==========================================================
  // !desvincularvip @usuario
  // ==========================================================

  if (command === 'desvincularvip') {
    if (!isOwner(message.author.id)) {
      return message.reply(
        '🔒 Somente a administração principal pode desvincular VIPs.'
      );
    }

    const member = message.mentions.members.first();

    if (!member) {
      return message.reply(
        '❌ Use: `!desvincularvip @usuario`'
      );
    }

    const vip = getVip(member.id);

    if (!vip) {
      return message.reply(
        '❌ Esse usuário não possui um VIP registrado.'
      );
    }

    db.prepare(
      'DELETE FROM vip_users WHERE user_id = ?'
    ).run(member.id);

    return message.reply(
      `✅ O VIP de ${member} foi desvinculado.\n` +
      `Os recursos existentes não foram apagados.`
    );
  }

  // ==========================================================
  // !vipinfo @usuario
  // ==========================================================

  if (command === 'vipinfo') {
    if (!isOwner(message.author.id)) {
      return message.reply(
        '🔒 Somente a administração principal pode consultar isso.'
      );
    }

    const member = message.mentions.members.first();

    if (!member) {
      return message.reply(
        '❌ Use: `!vipinfo @usuario`'
      );
    }

    const vip = getVip(member.id);

    if (!vip) {
      return message.reply(
        '❌ Esse usuário não possui VIP registrado.'
      );
    }

    const embed = new EmbedBuilder()
      .setTitle('👑 Informações do VIP')
      .setColor(0x8B5CF6)
      .addFields(
        {
          name: 'Usuário',
          value: `${member}`,
          inline: false
        },
        {
          name: 'Cargo',
          value: vip.role_id ? `<@&${vip.role_id}>` : 'Não vinculado',
          inline: true
        },
        {
          name: 'Call',
          value: vip.channel_id ? `<#${vip.channel_id}>` : 'Não vinculada',
          inline: true
        },
        {
          name: 'Expiração',
          value: formatDate(vip.expires_at),
          inline: false
        }
      );

    return message.reply({
      embeds: [embed]
    });
  }

  // ==========================================================
  // !add @usuario
  // ==========================================================

  if (command === 'add') {
    const result = checkVipOwnership({
      user: message.author
    });

    if (!result.ok) {
      return message.reply(result.message);
    }

    const vip = result.vip;

    if (!vip.role_id) {
      return message.reply(
        '❌ Seu VIP ainda não possui um cargo vinculado.'
      );
    }

    const target = message.mentions.members.first();

    if (!target) {
      return message.reply(
        '❌ Use: `!add @amigo`'
      );
    }

    const role = message.guild.roles.cache.get(vip.role_id);

    if (!role) {
      return message.reply(
        '❌ O cargo vinculado ao seu VIP não foi encontrado.'
      );
    }

    try {
      await target.roles.add(role);

      return message.reply(
        `✅ ${target} recebeu o cargo do seu VIP.`
      );
    } catch (error) {
      console.error(error);

      return message.reply(
        '❌ Não consegui adicionar o cargo. Verifique as permissões e a hierarquia de cargos.'
      );
    }
  }

  // ==========================================================
  // !configvip
  // ==========================================================

  if (command === 'configvip') {
    if (!isOwner(message.author.id)) {
      return message.reply(
        '🔒 Somente a administração principal pode configurar o painel VIP.'
      );
    }

    const config = getConfig();

    const embed = new EmbedBuilder()
      .setTitle('⚙️ CONFIGURAÇÃO DO PAINEL VIP')
      .setDescription(
        'Use os comandos abaixo para personalizar o painel que todos os VIPs irão receber.'
      )
      .setColor(parseColor(config.color))
      .addFields(
        {
          name: 'Título',
          value: config.title || 'Não configurado',
          inline: false
        },
        {
          name: 'Descrição',
          value: config.description || 'Não configurada',
          inline: false
        },
        {
          name: 'Cor',
          value: config.color || '#8B5CF6',
          inline: true
        },
        {
          name: 'Banner',
          value: config.banner ? 'Configurado' : 'Não configurado',
          inline: true
        },
        {
          name: 'Thumbnail',
          value: config.thumbnail ? 'Configurada' : 'Não configurada',
          inline: true
        },
        {
          name: 'Rodapé',
          value: config.footer || 'Não configurado',
          inline: false
        }
      );

    return message.reply({
      embeds: [embed],
      content:
        '**Comandos de configuração:**\n\n' +
        '`!viptitulo texto`\n' +
        '`!vipdescricao texto`\n' +
        '`!vipcor #8B5CF6`\n' +
        '`!vipbanner URL`\n' +
        '`!vipthumbnail URL`\n' +
        '`!viprodape texto`\n' +
        '`!viprodapeicon URL`'
    });
  }

  // ==========================================================
  // CONFIGURAÇÃO: TÍTULO
  // ==========================================================

  if (command === 'viptitulo') {
    if (!isOwner(message.author.id)) {
      return message.reply('🔒 Sem permissão.');
    }

    const value = args.join(' ');

    if (!value) {
      return message.reply('❌ Informe o novo título.');
    }

    db.prepare(`
      UPDATE panel_config
      SET title = ?
      WHERE id = 1
    `).run(value);

    return message.reply('✅ Título do painel atualizado.');
  }

  // ==========================================================
  // CONFIGURAÇÃO: DESCRIÇÃO
  // ==========================================================

  if (command === 'vipdescricao') {
    if (!isOwner(message.author.id)) {
      return message.reply('🔒 Sem permissão.');
    }

    const value = args.join(' ');

    if (!value) {
      return message.reply('❌ Informe a nova descrição.');
    }

    db.prepare(`
      UPDATE panel_config
      SET description = ?
      WHERE id = 1
    `).run(value);

    return message.reply('✅ Descrição atualizada.');
  }

  // ==========================================================
  // CONFIGURAÇÃO: COR
  // ==========================================================

  if (command === 'vipcor') {
    if (!isOwner(message.author.id)) {
      return message.reply('🔒 Sem permissão.');
    }

    const value = args[0];

    if (!value || !/^#[0-9A-Fa-f]{6}$/.test(value)) {
      return message.reply(
        '❌ Use uma cor hexadecimal, por exemplo: `!vipcor #8B5CF6`'
      );
    }

    db.prepare(`
      UPDATE panel_config
      SET color = ?
      WHERE id = 1
    `).run(value);

    return message.reply('✅ Cor atualizada.');
  }

  // ==========================================================
  // CONFIGURAÇÃO: BANNER
  // ==========================================================

  if (command === 'vipbanner') {
    if (!isOwner(message.author.id)) {
      return message.reply('🔒 Sem permissão.');
    }

    const value = args[0];

    if (!value || !isValidUrl(value)) {
      return message.reply(
        '❌ Informe uma URL válida para o banner.'
      );
    }

    db.prepare(`
      UPDATE panel_config
      SET banner = ?
      WHERE id = 1
    `).run(value);

    return message.reply('✅ Banner atualizado.');
  }

  // ==========================================================
  // CONFIGURAÇÃO: THUMBNAIL
  // ==========================================================

  if (command === 'vipthumbnail') {
    if (!isOwner(message.author.id)) {
      return message.reply('🔒 Sem permissão.');
    }

    const value = args[0];

    if (!value || !isValidUrl(value)) {
      return message.reply(
        '❌ Informe uma URL válida para a thumbnail.'
      );
    }

    db.prepare(`
      UPDATE panel_config
      SET thumbnail = ?
      WHERE id = 1
    `).run(value);

    return message.reply('✅ Thumbnail atualizada.');
  }

  // ==========================================================
  // CONFIGURAÇÃO: RODAPÉ
  // ==========================================================

  if (command === 'viprodape') {
    if (!isOwner(message.author.id)) {
      return message.reply('🔒 Sem permissão.');
    }

    const value = args.join(' ');

    if (!value) {
      return message.reply('❌ Informe o texto do rodapé.');
    }

    db.prepare(`
      UPDATE panel_config
      SET footer = ?
      WHERE id = 1
    `).run(value);

    return message.reply('✅ Rodapé atualizado.');
  }

  // ==========================================================
  // CONFIGURAÇÃO: ÍCONE DO RODAPÉ
  // ==========================================================

  if (command === 'viprodapeicon') {
    if (!isOwner(message.author.id)) {
      return message.reply('🔒 Sem permissão.');
    }

    const value = args[0];

    if (!value || !isValidUrl(value)) {
      return message.reply(
        '❌ Informe uma URL válida para a imagem do rodapé.'
      );
    }

    db.prepare(`
      UPDATE panel_config
      SET footer_icon = ?
      WHERE id = 1
    `).run(value);

    return message.reply(
      '✅ Imagem do rodapé atualizada.'
    );
  }
});

// ============================================================
// INTERAÇÕES DOS BOTÕES
// ============================================================

client.on('interactionCreate', async interaction => {
  if (!interaction.isButton()) return;

  const result = checkVipOwnership(interaction);

  if (!result.ok) {
    return interaction.reply({
      content: result.message,
      ephemeral: true
    });
  }

  const vip = result.vip;

  // ==========================================================
  // CARGO
  // ==========================================================

  if (interaction.customId === 'vip_role') {
    if (!vip.role_id) {
      const role = await interaction.guild.roles.create({
        name: `VIP ${interaction.user.username}`,
        color: parseColor(getConfig().color),
        reason: 'Criação de cargo VIP'
      });

      db.prepare(`
        UPDATE vip_users
        SET role_id = ?, role_created_by_bot = 1
        WHERE user_id = ?
      `).run(role.id, interaction.user.id);

      return interaction.reply({
        content: `✅ Seu cargo VIP foi criado: ${role}`,
        ephemeral: true
      });
    }

    const role = interaction.guild.roles.cache.get(vip.role_id);

    if (!role) {
      return interaction.reply({
        content: '❌ O cargo vinculado não existe mais.',
        ephemeral: true
      });
    }

    return interaction.reply({
      content:
        `🎖️ Seu cargo atual é ${role}.\n\n` +
        `Use a opção **Cor** para alterar a cor dele.`,
      ephemeral: true
    });
  }

  // ==========================================================
  // CANAL
  // ==========================================================

  if (interaction.customId === 'vip_channel') {
    if (!vip.channel_id) {
      const channel = await interaction.guild.channels.create({
        name: `🔒・${interaction.user.username}`,
        type: ChannelType.GuildVoice,
        reason: 'Criação de canal VIP'
      });

      db.prepare(`
        UPDATE vip_users
        SET channel_id = ?, channel_created_by_bot = 1
        WHERE user_id = ?
      `).run(channel.id, interaction.user.id);

      return interaction.reply({
        content: `✅ Sua call VIP foi criada: ${channel}`,
        ephemeral: true
      });
    }

    const channel = interaction.guild.channels.cache.get(
      vip.channel_id
    );

    if (!channel) {
      return interaction.reply({
        content: '❌ A call vinculada não existe mais.',
        ephemeral: true
      });
    }

    return interaction.reply({
      content:
        `🔊 Sua call atual é ${channel}.\n\n` +
        `Use **Nome** para alterar o nome dela.`,
      ephemeral: true
    });
  }

  // ==========================================================
  // COR
  // ======
