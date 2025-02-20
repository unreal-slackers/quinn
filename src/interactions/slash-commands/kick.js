import { SlashCommand } from 'hiei.js'
import { ApplicationCommandOptionType, EmbedBuilder, PermissionFlagsBits } from 'discord.js'
import { getUsername } from '../../utilities/discord-util.js'
import log from '../../utilities/logger.js'
import prisma from '../../utilities/prisma-client.js'

class Kick extends SlashCommand {
  constructor () {
    super({
      name: 'kick',
      description: 'Kick a user',
      options: [
        {
          type: ApplicationCommandOptionType.User,
          name: 'user',
          description: 'The user you want to kick',
          required: true
        },
        {
          type: ApplicationCommandOptionType.String,
          name: 'reason',
          description: 'The reason for kicking them, if any',
          required: true
        }
      ],
      defaultMemberPermissions: PermissionFlagsBits.BanMembers
    })
  }

  async run (interaction) {
    const member = interaction.options.getMember('user')
    const reason = interaction.options.getString('reason')

    log.info({ event: 'command-used', command: this.name, channel: interaction.channel.name })

    if (!member) {
      return interaction.reply({ content: 'That user is not in the server. If they still appear as an option, try refreshing your client.', ephemeral: true })
    }

    if (member.id === this.client.user.id) {
      return interaction.reply({ content: 'Nice try, human.', ephemeral: true })
    }

    if (member.id === interaction.member.id) {
      return interaction.reply({ content: 'You can\'t kick yourself.', ephemeral: true })
    }

    await interaction.deferReply({ ephemeral: true })

    if (member.kickable) {
      const incident = await prisma.case.create({
        data: {
          action: 'Kicked',
          member: getUsername(member),
          memberId: member.id,
          moderator: getUsername(interaction.member),
          moderatorId: interaction.member.id,
          reason
        }
      })

      // We can't notify members after they leave, so we have to do it before kicking
      const notification = new EmbedBuilder()
        .setAuthor({ name: interaction.guild.name, iconURL: interaction.guild.iconURL() })
        .setTitle('Kicked from the server')
        .setDescription(`**Reason:** ${reason}`)
        .setTimestamp()

      try {
        await member.send({ embeds: [notification] })
      } catch (e) {
        await interaction.followUp({ content: ':warning: The user wasn\'t notified because they\'re not accepting direct messages.', ephemeral: true })
      }

      await member.kick(reason)
      await interaction.followUp({ content: `${getUsername(member)} was kicked from the server.`, ephemeral: true })

      const moderationLogChannel = interaction.guild.channels.cache.get(process.env.MODERATION_LOG_CHANNEL)
      const moderationLogEmbed = new EmbedBuilder()
        .setAuthor({ name: '🥾 Kicked' })
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
      return interaction.followUp({ content: 'I don\'t have permission to kick that member.', ephemeral: true })
    }
  }
}

export default Kick
