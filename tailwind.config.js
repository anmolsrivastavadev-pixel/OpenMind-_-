/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,jsx}'],
  theme: {
    extend: {
      colors: {
        bg: '#0b0e14',
        panel: '#131722',
        panel2: '#1e222d',
        line: '#2a2e39',
        hover: '#2a2e39',
        txt: '#d1d4dc',
        mute: '#787b86',
        up: '#089981',
        down: '#f23645',
        accent: '#2962ff',
        warn: '#f5a623',
      },
      fontFamily: {
        sans: ['-apple-system', 'BlinkMacSystemFont', 'Trebuchet MS', 'Roboto', 'Ubuntu', 'sans-serif'],
        mono: ['ui-monospace', 'SFMono-Regular', 'Menlo', 'Consolas', 'monospace'],
      },
    },
  },
  plugins: [],
};
