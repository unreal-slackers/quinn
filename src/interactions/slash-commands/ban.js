import { SlashCommand } from 'hiei.js'
import { ApplicationCommandOptionType, EmbedBuilder, PermissionFlagsBits } from 'discord.js'
import { getUsername } from '../../utilities/discord-util.js'
import log from '../../utilities/logger.js'
import prisma from '../../utilities/prisma-client.js'

class Ban extends SlashCommand {
  constructor () {
    super({
      name: 'ban',
      description: 'Ban a user',
      options: [
        {
          type: ApplicationCommandOptionType.User,
          name: 'user',
          description: 'The user you want to ban',
          required: true
        },
        {
          type: ApplicationCommandOptionType.Integer,
          name: 'messages',
          description: 'How much of their recent message history to delete',
          required: true,
          choices: [
            { name: 'Don\'t delete any', value: 0 },
            { name: 'Previous 24 hours', value: 60 * 60 * 24 },
            { name: 'Previous 7 days', value: 60 * 60 * 24 * 7 }
          ]
        },
        {
          type: ApplicationCommandOptionType.String,
          name: 'reason',
          description: 'The reason for banning them, if any',
          required: true
        }
      ],
      defaultMemberPermissions: PermissionFlagsBits.BanMembers
    })
  }

  async run (interaction) {
    const member = interaction.options.getMember('user')
    const messages = interaction.options.getInteger('messages')
    const reason = interaction.options.getString('reason')
    let canNotify = true

    log.info({ event: 'command-used', command: this.name, channel: interaction.channel.name })

    if (!member) {
      return interaction.reply({ content: 'That user is not in the server. If they still appear as an option, try refreshing your client.', ephemeral: true })
    }

    if (member.id === this.client.user.id) {
      return interaction.reply({ content: 'Nice try, human.', ephemeral: true })
    }

    if (member.id === interaction.member.id) {
      return interaction.reply({ content: 'You can\'t ban yourself.', ephemeral: true })
    }

    await interaction.deferReply({ ephemeral: true })

    if (member.bannable) {
      const incident = await prisma.case.create({
        data: {
          action: 'Banned',
          member: getUsername(member),
          memberId: member.id,
          moderator: getUsername(interaction.member),
          moderatorId: interaction.member.id,
          reason
        }
      })

      const strikes = await prisma.case.findMany({
        where: {
          memberId: member.id,
          strike: {
            is: { isActive: true }
          }
        }
      })

      await Promise.all(strikes.map(strike => {
        return prisma.strike.update({
          where: { id: strike.id },
          data: { isActive: false }
        })
      }))

      // We can't notify members after they leave, so we have to do it before banning
      const notification = new EmbedBuilder()
        .setAuthor({ name: interaction.guild.name, iconURL: interaction.guild.iconURL() })
        .setTitle('Banned from the server')
        .setDescription(`**Reason:** ${reason}\n—\nYou may appeal the ban by filling out [this form](${process.env.BAN_APPEAL_LINK}). Our staff will review your appeal and respond as soon as possible.`)
        .setTimestamp()

      try {
        await member.send({ embeds: [notification] })
      } catch (e) {
        canNotify = false
      }

      if (canNotify) {
        await member.ban({ deleteMessageSeconds: messages, reason })
        await interaction.followUp({ content: `${getUsername(member)} was banned from the server.`, ephemeral: true })
      } else {
        await member.ban({ deleteMessageSeconds: messages, reason })
        await interaction.followUp({ content: `${getUsername(member)} was banned from the server.`, ephemeral: true })
        await interaction.followUp({ content: ':warning: The user wasn\'t notified because they\'re not accepting direct messages.', ephemeral: true })
      }

      const moderationLogChannel = interaction.guild.channels.cache.get(process.env.MODERATION_LOG_CHANNEL)
      const moderationLogEmbed = new EmbedBuilder()
        .setAuthor({ name: '⛔ Banned' })
        .setDescription(`**Member:** ${incident.member}\n**Member ID:** ${incident.memberId}\n**Reason:** ${incident.reason}`)
        .setFooter({ text: `Case ${incident.id} • ${incident.moderator}` })
        .setThumbnail(member.displayAvatarURL())
        .setTimestamp()

      const moderationLogEntry = await moderationLogChannel.send({ embeds: [moderationLogEmbed] })

      await prisma.case.update({
        where: { id: incident.id },
        data: { reference: moderationLogEntry.url }
      })

      prisma.$disconnect()
    } else {
      return interaction.followUp({ content: 'I don\'t have permission to ban that member.', ephemeral: true })
    }
  }
}

export default Ban
