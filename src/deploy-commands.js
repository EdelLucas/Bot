// Registriert die Slash-Commands bei Discord. Passiert auch automatisch beim Bot-Start
// (abschaltbar mit COMMANDS_AUTOMATISCH_REGISTRIEREN=false).
const { registerCommands } = require('./register-commands');

registerCommands()
  .then(({ count, scope }) => console.log(`✅ ${count} Commands ${scope} registriert.`))
  .catch((err) => {
    console.error('Fehler beim Registrieren:', err);
    process.exit(1);
  });
