// Generates src/styles/tokens.css from design-system/tokens.json.
// Run with `pnpm tokens` after editing the tokens.
import { readFileSync, writeFileSync } from 'node:fs';

const tokens = JSON.parse(readFileSync('design-system/tokens.json', 'utf8'));
const themes = tokens.color.themes.map((t) => t.id);
const [first, ...rest] = themes;

const valueFor = (token, theme) =>
  typeof token.value === 'string' ? token.value : (token.value[theme] ?? token.value[first]);

const themed = (list, theme) =>
  [...list].map((t) => `  --${t.name}: ${valueFor(t, theme)};`).join('\n');

const themeVars = (theme) => themed([...tokens.color.tokens, ...tokens.shadow.tokens], theme);

const plain = (family) => tokens[family].tokens.map((t) => `  --${t.name}: ${t.value};`).join('\n');

const fonts = Object.entries(tokens.type.families)
  .map(([key, stack]) => `  --font-${key}: ${stack};`)
  .join('\n');

const styleClasses = tokens.type.groups
  .flatMap((group) => group.styles.map((style) => ({ style, family: style.family ?? group.family })))
  .map(({ style, family }) => {
    const lines = [
      `  font-family: var(--font-${family});`,
      `  font-size: ${style.fontSize};`,
      `  line-height: ${style.lineHeight};`,
      `  font-weight: ${style.fontWeight};`,
    ];
    if (style.letterSpacing) lines.push(`  letter-spacing: ${style.letterSpacing};`);
    return `.${style.name} {\n${lines.join('\n')}\n}`;
  })
  .join('\n');

const css = `/* ${tokens.name} — generated from design-system/tokens.json by scripts/build-tokens.mjs. Do not edit. */

:root,
[data-theme='${first}'] {
${themeVars(first)}
  color-scheme: ${first};
}

${rest
  .map((theme) => `[data-theme='${theme}'] {\n${themeVars(theme)}\n  color-scheme: ${theme};\n}`)
  .join('\n\n')}

/* Follow the OS until the user picks a theme explicitly. */
${rest
  .map(
    (theme) =>
      `@media (prefers-color-scheme: ${theme}) {\n  :root:not([data-theme]) {\n${themeVars(theme)
        .split('\n')
        .map((l) => '  ' + l)
        .join('\n')}\n    color-scheme: ${theme};\n  }\n}`,
  )
  .join('\n\n')}

:root {
${plain('spacing')}
${plain('radius')}
${fonts}
}

${styleClasses}
`;

writeFileSync('src/styles/tokens.css', css);
console.log('wrote src/styles/tokens.css');
