const DEFAULT_TEXT_COLOR = "#55330e";

const STORAGE_ACTIVE_MODEL = "giftcard_active_model";
const STORAGE_DRAFT_PREFIX = "giftcard_draft_";

/** Resolución nativa de exportación (debe coincidir con los archivos en modelos/) */
const EXPORT_FORMAT = "png";
const EXPORT_QUALITY = 1;

const ZOOM_DEFAULT = 0.68;
const ZOOM_MOBILE_DEFAULT = 1;
const ZOOM_MIN = 0.25;
const ZOOM_MAX = 1.5;
const ZOOM_STEP = 0.08;

const MODELS = [
  {
    id: "mod1",
    name: "Modelo 1",
    file: "modelos/mod1.jpg",
    width: 1356,
    height: 784,
  },
  {
    id: "mod2",
    name: "Modelo 2",
    file: "modelos/mod2.jpg",
    width: 1356,
    height: 784,
  },
  {
    id: "mod3",
    name: "Modelo 3",
    file: "modelos/mod3.jpg",
    width: 1356,
    height: 784,
  },
  {
    id: "mod4",
    name: "Modelo 4",
    file: "modelos/mod4.jpg",
    width: 1356,
    height: 784,
  },
];

const FONTS = [
  "DM Sans",
  "Montserrat",
  "Open Sans",
  "Roboto",
  "Playfair Display",
  "Lora",
  "Dancing Script",
  "Great Vibes",
  "Arial",
  "Georgia",
  "Times New Roman",
  "Courier New",
];

const EMOJIS = [
  "🎁", "🎉", "🎊", "❤️", "💛", "⭐", "✨", "🔥", "👍", "🙌",
  "🍽️", "🍷", "🥂", "🍾", "☕", "🍰", "🎂", "🌮", "🍕", "🍣",
  "😊", "😍", "🥰", "💝", "🏆", "💯", "✅", "📅", "📍", "📞",
  "€", "💰", "💵", "🎫", "🎟️", "🇮🇹", "🇵🇪", "🌿", "🌸", "🌺",
];

const SYMBOLS = [
  "★", "☆", "♥", "♦", "♣", "♠", "•", "◆", "◇", "▪",
  "▫", "→", "←", "↑", "↓", "↔", "✓", "✗", "©", "®",
  "™", "№", "§", "¶", "†", "‡", "°", "±", "×", "÷",
  "∞", "≈", "≠", "≤", "≥", "½", "¼", "¾", "«", "»",
];
