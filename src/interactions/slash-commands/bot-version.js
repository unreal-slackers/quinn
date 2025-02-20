import { SlashCommand } from 'hiei.js'
import { PermissionFlagsBits } from 'discord.js'
import { importJson } from '../../utilities/json-util.js'
import { resolve } from 'node:path'
import log from '../../utilities/logger.js'

class BotVersion extends SlashCommand {
  constructor () {
    super({
      name: 'version',
      description: 'Check which version of the bot is running',
      defaultMemberPermissions: PermissionFlagsBits.ManageGuild
    })
  }

  async run (interaction) {
    const meta = await importJson(resolve(process.cwd(), 'package.json'))

    log.info({ event: 'command-used', command: this.name, channel: interaction.channel.name })

    return interaction.reply({ content: `Current version is \`${meta.version}\``, ephemeral: true })
  }
}

export default BotVersion
