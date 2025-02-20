import { Listener } from 'hiei.js'
import Cron from 'croner'
import { EmbedBuilder } from 'discord.js'
import log from '../utilities/logger.js'
import prisma from '../utilities/prisma-client.js'

class ClientReady extends Listener {
  constructor () {
    super({
      name: 'ClientReady',
      emitter: 'client',
      event: 'ready',
      once: true
    })
  }

  async run (client) {
    const guild = await this.client.guilds.fetch(process.env.GUILD)

    log.info({ event: 'client-ready', guild: guild.name }, `${client.user.username} connected to ${guild.name}`)

    // Remove expired strikes
    Cron('@daily', async () => {
      const now = new Date()
      const activeStrikes = await prisma.case.findMany({
        where: {
          action: 'Strike added',
          strike: {
            isActive: true
          }
        },
        include: { strike: true }
      })

      const expiredStrikes = activeStrikes.filter(record => record.strike.expiration <= now)

      if (expiredStrikes.length > 0) {
        for await (const strike of expiredStrikes) {
          await prisma.strike.update({
            where: { id: strike.id },
            data: {
              isActive: false
            }
          })

          const member = await guild.members.fetch(strike.memberId)

          if (member) {
            const strikesRemaining = await prisma.case.count({
              where: {
                action: 'Strike added',
                memberId: member.id,
                strike: {
                  isActive: true
                }
              }
            })

            const notification = new EmbedBuilder()
              .setAuthor({ name: guild.name, iconURL: guild.iconURL() })
              .setTitle('One of your strikes expired')
              .setDescription(strikesRemaining === 0 ? 'No strikes remaining. ' : `${strikesRemaining} strikes remaining`)
              .setTimestamp()

            try {
              await member.send({ embeds: [notification] })
            } catch (e) {
              console.error(e)
              log.error({ event: 'notification-failed', member: member.user.username }, `Failed to notify ${member.user.username} of an expired strike`)
            }
          }
        }
      }

      prisma.$disconnect()
    })
  }
}

export default ClientReady
