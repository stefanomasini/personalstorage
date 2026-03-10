export default {
    tabWidth: 4,
    useTabs: false,
    semi: true,
    singleQuote: true,
    printWidth: 160,

    trailingComma: 'all',
    quoteProps: 'as-needed',
    bracketSpacing: true,
    bracketSameLine: false,
    arrowParens: 'always',
    endOfLine: 'lf',

    overrides: [
        {
            files: '*.{js,jsx,ts,tsx}',
            options: {
                parser: 'typescript',
            },
        },
        {
            files: '*.json',
            options: {
                parser: 'json',
                tabWidth: 4,
            },
        },
        {
            files: '*.md',
            options: {
                parser: 'markdown',
                printWidth: 80,
                proseWrap: 'preserve',
            },
        },
    ],
};
