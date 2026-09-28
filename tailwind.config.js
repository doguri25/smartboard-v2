// Tailwind v3 설정
// 회색 계열 색·모서리·그림자는 src/skins.css 의 디자인 테마 변수에 연결됩니다.
// (예: bg-white → rgb(var(--sk-surface)), text-slate-800 → rgb(var(--sk-text-1)))
const v = (name) => `rgb(var(${name}) / <alpha-value>)`;

/** @type {import('tailwindcss').Config} */
export default {
  content: ["./index.html", "./src/**/*.{ts,js}"],
  theme: {
    // 주의: 기본 색 목록을 펼친 뒤 같은 키를 다시 쓰면 "원래 순서"를 유지한 채 값만 바뀜
    //       (bg-white 가 bg-red-100 보다 앞에 생성되어야 색 칩이 색을 유지함)
    backgroundColor: ({ theme }) => ({
      ...theme("colors"),
      white: v("--sk-surface"),
      black: v("--sk-overlay"),
      slate: {
        ...theme("colors.slate"),
        50: v("--sk-surface-2"), 100: v("--sk-surface-3"), 200: v("--sk-surface-4"), 300: v("--sk-surface-5"),
        700: v("--sk-ink"), 800: v("--sk-ink"), 900: v("--sk-ink-2"),
      },
    }),
    textColor: ({ theme }) => ({
      ...theme("colors"),
      slate: { ...theme("colors.slate"), 400: v("--sk-text-5"), 500: v("--sk-text-4"), 600: v("--sk-text-3"), 700: v("--sk-text-2"), 800: v("--sk-text-1"), 900: v("--sk-text-1") },
    }),
    borderColor: ({ theme }) => ({
      ...theme("colors"),
      // 색 없이 `border` 만 쓴 곳의 기본 테두리색 (빠뜨리면 currentColor = 검정/흰 선이 생김)
      DEFAULT: v("--sk-line"),
      white: v("--sk-surface"),
      slate: { ...theme("colors.slate"), 100: v("--sk-line"), 200: v("--sk-line"), 300: v("--sk-line-2"), 400: v("--sk-line-3"), 700: v("--sk-line-3") },
    }),
    ringColor: ({ theme }) => ({ ...theme("colors"), DEFAULT: "var(--brand-500)", white: v("--sk-surface") }),
    extend: {
      colors: {
        brand: {
          50: "var(--brand-50)", 100: "var(--brand-100)", 300: "var(--brand-300)",
          400: "var(--brand-400)", 500: "var(--brand-500)", 600: "var(--brand-600)",
          700: "var(--brand-700)", 800: "var(--brand-800)",
        },
      },
      borderRadius: { xl: "var(--sk-r1)", "2xl": "var(--sk-r2)", "3xl": "var(--sk-r3)" },
      boxShadow: {
        sm: "var(--sk-shadow-sm)", md: "var(--sk-shadow-md)", lg: "var(--sk-shadow-lg)",
        xl: "var(--sk-shadow-xl)", "2xl": "var(--sk-shadow-2xl)",
      },
      fontFamily: {
        sans: ['"Jua"', '"Nanum Gothic"', "sans-serif"],
        serif: ['"Nanum Myeongjo"', "serif"],
        cursive: ['"Poor Story"', "cursive"],
        mono: ["monospace"],
      },
    },
  },
  plugins: [],
};
