// Detecta visitas automáticas para que no cuenten como "el cliente abrió el documento".
// Los antivirus de correo y las vistas previas abren los links antes que la persona.

const BOT_PATTERNS = [
  /bot\b/i,
  /crawler|spider|scanner|preview/i,
  /googleimageproxy|google-safety|feedfetcher/i,
  /microsoft office|ms-office|outlook|safelinks|bingpreview/i,
  /proofpoint|mimecast|barracuda|forcepoint|symantec|trendmicro|sophos|fortinet|cisco/i,
  /slackbot|whatsapp|facebookexternalhit|telegrambot|discordbot|linkedinbot|twitterbot|skypeuripreview/i,
  /headlesschrome|phantomjs|puppeteer|playwright|selenium/i,
  /curl|wget|python-requests|python-urllib|aiohttp|httpclient|okhttp|go-http-client|java\//i,
];

export function isBot(userAgent: string | null | undefined): boolean {
  if (!userAgent || userAgent.length < 20) return true;
  return BOT_PATTERNS.some((re) => re.test(userAgent));
}
