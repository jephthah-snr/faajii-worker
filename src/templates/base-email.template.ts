const FAAJII_PATTERN_BG =
  "https://firebasestorage.googleapis.com/v0/b/faajii-e491a.firebasestorage.app/o/app-images%2Ffaajii-bg-pattern.png?alt=media&token=3284dea5-5670-4b66-ae16-a420d1629d9b";
const FAAJII_TEXT_LOGO =
  "https://firebasestorage.googleapis.com/v0/b/faajii-e491a.firebasestorage.app/o/app-images%2Ffaajii-texto.png?alt=media&token=28f853c6-786b-4d5f-87fb-db4873ee68c5";
const APP_STORE_BADGE =
  "https://developer.apple.com/assets/elements/badges/download-on-the-app-store.svg";
const PLAY_STORE_BADGE =
  "https://play.google.com/intl/en_us/badges/static/images/badges/en_badge_web_generic.png";

const esc = (value: string) =>
  value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");

export interface BaseEmailLayoutOptions {
  body: string;
  preheader?: string;
  appUrl: string;
  appStoreUrl?: string;
  playStoreUrl?: string;
  facebookUrl?: string;
  instagramUrl?: string;
  tiktokUrl?: string;
  location?: string;
  year?: number;
}

export function buildBaseEmailLayout(options: BaseEmailLayoutOptions): string {
  const year = options.year ?? new Date().getFullYear();
  const appStoreUrl = options.appStoreUrl || options.appUrl;
  const playStoreUrl = options.playStoreUrl || options.appUrl;
  const socials: Array<[string, string]> = [];
  if (options.facebookUrl) socials.push(["Facebook", options.facebookUrl]);
  if (options.instagramUrl) socials.push(["Instagram", options.instagramUrl]);
  if (options.tiktokUrl) socials.push(["TikTok", options.tiktokUrl]);
  const socialLinks = socials
    .map(
      (item) =>
        `<a href="${esc(
          item[1]
        )}" style="color:#111111;text-decoration:none;font:700 13px Arial,sans-serif;margin:0 9px;">${
          item[0]
        }</a>`
    )
    .join("");

  return `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><style>@media only screen and (max-width:620px){.email-shell{width:100%!important}.email-padding{padding-left:20px!important;padding-right:20px!important}.event-cell{display:block!important;width:100%!important}.store-badge{height:36px!important}}</style></head>
<body style="margin:0;padding:0;background:#f2f3f5;">
${
  options.preheader
    ? `<div style="display:none;max-height:0;overflow:hidden;opacity:0;color:transparent;">${esc(
        options.preheader
      )}</div>`
    : ""
}
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="width:100%;background:#f2f3f5;font-family:Arial,sans-serif;"><tr><td align="center">
  <table role="presentation" class="email-shell" width="620" cellpadding="0" cellspacing="0" border="0" style="width:620px;max-width:100%;background:#ffffff;">
    <tr><td class="email-padding" style="padding:40px 30px 82px;background-color:#f7f7f7;background-image:url('${FAAJII_PATTERN_BG}');background-repeat:repeat;background-size:360px auto;"><a href="${esc(
    options.appUrl
  )}"><img src="${FAAJII_TEXT_LOGO}" alt="Faajii" width="160" style="display:block;width:160px;max-width:100%;height:auto;border:0;"></a></td></tr>
    <tr><td>${options.body}</td></tr>
    <tr><td align="center" class="email-padding" style="padding:48px 28px 42px;color:#ffffff;background-color:#050505;background-image:linear-gradient(rgba(5,5,5,.94),rgba(5,5,5,.94)),url('${FAAJII_PATTERN_BG}');background-repeat:repeat;background-size:360px auto;">
      <p style="margin:0 0 28px;font:20px/29px Arial,sans-serif;">Handle, plan, discover and share events in one place</p>
      <a href="${esc(
        appStoreUrl
      )}" style="display:inline-block;margin:4px 8px;"><img class="store-badge" src="${APP_STORE_BADGE}" alt="Download on the App Store" height="40" style="display:block;height:40px;width:auto;border:0;"></a>
      <a href="${esc(
        playStoreUrl
      )}" style="display:inline-block;margin:4px 8px;"><img class="store-badge" src="${PLAY_STORE_BADGE}" alt="Get it on Google Play" height="40" style="display:block;height:40px;width:auto;border:0;"></a>
    </td></tr>
    <tr><td align="center" style="padding:32px 20px 38px;background:#f2f3f5;color:#777777;">
      ${
        socialLinks
          ? `<div style="margin-bottom:26px;">${socialLinks}</div>`
          : ""
      }
      <p style="margin:0 0 14px;font:16px/22px Arial,sans-serif;">${esc(
        options.location || "Lekki, Lagos Nigeria"
      )}</p>
      <p style="margin:0;font:16px/22px Arial,sans-serif;">${year}. Faajii. All rights reserved.</p>
    </td></tr>
  </table>
</td></tr></table></body></html>`;
}
