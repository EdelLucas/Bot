function formatEntry(e) {
  const kat = e.Kategorie ? ` \`${e.Kategorie}\`` : '';
  const text = e.Inhalt.length > 120 ? `${e.Inhalt.slice(0, 117)}…` : e.Inhalt;
  return `**#${e.ID}**${kat} ${text} — *${e.Benutzer}, ${e.Datum}*`;
}
module.exports = { formatEntry };
