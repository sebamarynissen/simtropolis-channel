import wh from '@whisthub/eslint-config/flat';

export default [
	wh,
	{
		files: ['extensions/src/**'],
		languageOptions: {
			globals: {
				chrome: 'readonly',
			},
		}
	},
];
