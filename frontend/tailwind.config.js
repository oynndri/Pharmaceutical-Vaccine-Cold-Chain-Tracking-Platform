/** @type {import('tailwindcss').Config} */
// Tokens taken from the UI/UX team's Figma design (ColdChain Pulse).
export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      fontFamily: { sans: ['"Inter Variable"', 'Inter', 'system-ui', 'sans-serif'] },
      colors: {
        navy: { 950: '#0B2036', 900: '#102A43', 800: '#17344F', 700: '#21415F', 600: '#2E5070' },
        ink: '#172D46',
        body: '#24364B',
        muted: '#6A798B',
        faint: '#8C98A8',
        line: { DEFAULT: '#E3E9EF', soft: '#EDF0F4' },
        canvas: '#F5F7FA',
        sidebar: { text: '#A4B6C8', label: '#8592A4' },
        accent: '#57D1C1',
        brand: { DEFAULT: '#0D9488', hover: '#0B7F75', soft: '#E6F6F4', link: '#0F766E' },
        code: '#4A7187',
        ok: { DEFAULT: '#3B9980', text: '#22735F', bg: '#EDF8F4', line: '#D9EEE5' },
        warn: { DEFAULT: '#D39B34', text: '#8F6110', bg: '#FFF8EC', line: '#F5E3C0' },
        crit: { DEFAULT: '#D75A5E', text: '#B23A3F', bg: '#FFF4F2', line: '#F7E1DD' },
        info: { DEFAULT: '#5B7FD6', text: '#3D5FB0', bg: '#F0F4FE', line: '#DCE5FA' },
      },
      boxShadow: {
        card: '0 1px 2px rgba(29,48,64,0.04), 0 2px 6px rgba(29,48,64,0.03)',
        nav: '0 3px 8px rgba(8,30,43,0.18)',
      },
      letterSpacing: { tightest: '-0.035em', eyebrow: '0.18em' },
    },
  },
  plugins: [],
};
