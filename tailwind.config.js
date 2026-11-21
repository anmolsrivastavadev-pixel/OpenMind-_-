/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,jsx}'],
  theme: {
    extend: {
      colors: {
        bg: '#0b0b0b',
        panel: '#121212',
        panel2: '#1a1a1a',
        line: '#262626',
        hover: '#222222',
        txt: '#dbdbdb',
        mute: '#8b8b8b',
        up: '#089981',
        down: '#f23645',
        accent: '#2962ff',
        warn: '#f5a623',
      },
      fontFamily: {
        sans: ['Roboto', '-apple-system', 'BlinkMacSystemFont', 'Segoe UI', 'Helvetica Neue', 'sans-serif'],
        mono: ['ui-monospace', 'SFMono-Regular', 'Menlo', 'Consolas', 'monospace'],
      },
    },
  },
  plugins: [],
};
