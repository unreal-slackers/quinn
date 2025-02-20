import { SlashCommand } from 'hiei.js'
import { ApplicationCommandOptionType, EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle, ComponentType, PermissionFlagsBits, time } from 'discord.js'
import ms from 'ms'
import log from '../../utilities/logger.js'
import { getUsername } from '../../utilities/discord-util.js'
import prisma from '../../utilities/prisma-client.js'

class MegaBan extends SlashCommand {
  constructor () {
    super({
      name: 'megaban',
      description: 'Ban all members that recently joined the server with new accounts',
      options: [
        {
          type: ApplicationCommandOptionType.String,
          name: 'joined',
          description: 'Include members who joined the server this long ago',
          required: true,
          choices: [
            { name: '5 minutes ago', value: '5 mins' },
            { name: '15 minutes ago', value: '15 mins' },
            { name: '30 minutes ago', value: '30 mins' },
            { name: '1 hour ago', value: '1 hour' }
          ]
        },
        {
          type: ApplicationCommandOptionType.String,
          name: 'created',
          description: 'Include accounts created this long ago',
          required: true,
          choices: [
            { name: '1 hour ago', value: '1 hour' },
            { name: '1 day ago', value: '1 day' },
            { name: '1 week ago', value: '1 week' },
            { name: '1 month ago', value: '1 month' }
          ]
        },
        {
          type: ApplicationCommandOptionType.Integer,
          name: 'messages',
          description: 'How much of their recent message history to delete',
          required: true,
          choices: [
            { name: 'Don\'t delete any', value: 0 },
            { name: 'Previous 24 hours', value: 1 },
            { name: 'Previous 7 days', value: 7 }
          ]
        },
        {
          type: ApplicationCommandOptionType.String,
          name: 'reason',
          description: 'The reason for banning them',
          required: true
        }
      ],
      defaultMemberPermissions: PermissionFlagsBits.BanMembers
    })
  }

  async run (interaction) {
    try {
      const joined = interaction.options.getString('joined')
      const created = interaction.options.getString('created')
      const messages = interaction.options.getInteger('messages')
      const reason = interaction.options.getString('reason')
      const joinedCutoff = new Date(Date.now() - ms(joined))
      const createdCutoff = new Date(Date.now() - ms(created))

      await interaction.deferReply({ ephemeral: true })

      const members = await interaction.guild.members.fetch({ force: true })
      const matches = members.filter(member => member.joinedTimestamp > joinedCutoff && member.user.createdTimestamp > createdCutoff)
      const matchMentions = matches.map(member => `<@${member.id}>`).join(' ')

      log.info({ event: 'command-used', command: this.name, channel: interaction.channel.name })

      if (matches.size !== 0) {
        const banButton = new ButtonBuilder()
          .setCustomId('banButton')
          .setLabel(`Ban ${matches.size} Members`)
          .setStyle(ButtonStyle.Danger)

        const cancelButton = new ButtonBuilder()
          .setCustomId('cancelButton')
          .setLabel('Cancel')
          .setStyle(ButtonStyle.Secondary)

        const buttons = new ActionRowBuilder().addComponents([cancelButton, banButton])
        const prompt = await interaction.followUp({ content: `Found ${matches.size} ${matches.size > 1 ? 'members' : 'member'} who joined after ${time(joinedCutoff)} with accounts created after ${time(createdCutoff)}:\n${matchMentions}`, components: [buttons], ephemeral: true })
        const collector = prompt.createMessageComponentCollector({ componentType: ComponentType.Button, time: ms('1 minute') })

        collector.on('collect', async i => {
          if (i.customId === 'banButton') {
            const successfulBans = []
            const failedBans = []

            for await (const member of matches.values()) {
              if (member.bannable) {
                await interaction.guild.members.ban(member, { days: messages, reason })
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

                successfulBans.push(member)
                prisma.$disconnect()
              } else {
                failedBans.push(member)
              }
            }

            const successMentions = successfulBans.map(member => `<@${member.id}>`).join(' ')
            const failMentions = failedBans.map(member => `<@${member.id}>`).join(' ')

            await interaction.followUp({ content: `Successfully banned ${successfulBans.length} of ${matches.size} accounts. ${failedBans !== 0 ? `\n\n**Successful Bans**\n${successMentions}\n\n**Failed Bans**\n${failMentions}` : ''}`, ephemeral: true })

            const moderationLog = interaction.guild.channels.cache.get(process.env.MODERATION_LOG_CHANNEL)
            const moderationLogEntry = new EmbedBuilder()
              .setAuthor({ name: '☢️ MegaBan' })
              .setDescription(`**Accounts Banned:** ${successfulBans.length}\n**Criteria:** Created up to ${created} ago • joined server up to ${joined} ago\n**Reason:** ${reason}`)
              .setFooter({ text: getUsername(interaction.member) })
              .setTimestamp()

            return moderationLog.send({ embeds: [moderationLogEntry] })
          }

          if (i.customId === 'cancelButton') {
            await buttons.components.forEach(button => {
              button.setDisabled(true)
            })

            return i.update({ content: 'MegaBan cancelled.', components: [] })
          }
        })
      } else {
        return interaction.followUp({ content: 'No matches found. You may need to adjust the parameters and try again.', ephemeral: true })
      }
    } catch (e) {
      console.error(e)
    }
  }
}

export default MegaBan
