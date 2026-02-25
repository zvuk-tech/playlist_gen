const translations = {
  ru: {
    settings: "Zvuk Playlist Generator v1.2",
    settingsGroup: "Настройки",

    main: "Основные",
    length: "Длина",
    spacing: "Интервал",
    width: "Ширина",

    heightWave: "Высота волны",
    maxHeight: "Макс. высота",
    heightRandom: "Разность высоты",

    waveShape: "Форма волны",
    amplitude: "Амплитуда",
    offset: "Смещение",

    lineCount: "Количество волн",
    amount: "Количество",
    lineSpacing: "Интервал",

    rotation: "Вращение",
    position: "Позиция",

    color: "Цвета",
    background: "Фон",
    wave: "Волна",

    randomColors: "Рандом цвета",
    randomBg: "Рандом фона",
    randomWave: "Рандом волны",

    other: "Прочее",
    skewX: "Наклон X",
    skewY: "Наклон Y",
    chaos: "Хаотичность",

    random: "✨Сгенерировать✨",
    reset: "Сброс",
    save: "Сохранить",

    // ✅ new
    logo: "Лого",
    plaque: "Подложка",
  },

  en: {
    settings: "Zvuk Playlist Generator v1.2",
    settingsGroup: "Settings",

    main: "Main",
    length: "Length",
    spacing: "Spacing",
    width: "Width",

    heightWave: "Wave height",
    maxHeight: "Max height",
    heightRandom: "Height variance",

    waveShape: "Wave shape",
    amplitude: "Amplitude",
    offset: "Offset",

    lineCount: "Wave copies",
    amount: "Amount",
    lineSpacing: "Spacing",

    rotation: "Rotation",
    position: "Position",

    color: "Colors",
    background: "Background",
    wave: "Wave",

    randomColors: "Random colors",
    randomBg: "Random bg",
    randomWave: "Random wave",

    other: "Other",
    skewX: "Skew X",
    skewY: "Skew Y",
    chaos: "Chaos",

    random: "✨Generate✨",
    reset: "Reset",
    save: "Save",

    // ✅ new
    logo: "Logo",
    plaque: "Plaque",
  }
};

function applyTranslations(lang) {
  const dict = translations[lang] || translations.ru;
  document.querySelectorAll("[data-i18n]").forEach(el => {
    const key = el.getAttribute("data-i18n");
    if (dict[key]) el.textContent = dict[key];
  });
}

window.addEventListener("DOMContentLoaded", () => {
  applyTranslations("en");
  document.getElementById("langRu")?.addEventListener("click", () => applyTranslations("ru"));
  document.getElementById("langEn")?.addEventListener("click", () => applyTranslations("en"));
});
