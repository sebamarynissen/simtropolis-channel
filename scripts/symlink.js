import cp from 'node:child_process';
import path from 'node:path';

cp.execSync(`mklink /j "${process.env.SC4_PLUGINS}" "${path.resolve(import.meta.dirname, '../dist/plugins')}"`, {
	stdio: 'inherit',
});
