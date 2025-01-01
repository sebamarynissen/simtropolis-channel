import wh from '@whisthub/eslint-config/flat';

export default [
	wh,
	{
		files: ['extensions/chrome/**'],
		languageOptions: {
			globals: {
				chrome: 'readonly',
			},
		}
	},
];
