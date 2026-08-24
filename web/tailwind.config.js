export default {
  content: ["./index.html", "./src/**/*.{js,jsx}"],
  theme: {
    extend: {
      colors: {
        // Фирменные цвета школы: красный / чёрный / белый (как на логотипе)
        brand: {
          DEFAULT: "#DC2626",   // основной красный
          dark: "#B91C1C",      // красный при наведении
          black: "#0A0A0A",     // фон тёмных панелей
        },
      },
    },
  },
  plugins: [],
};
