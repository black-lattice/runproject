// 测试脚本顺序保持
const testPackageJson = `
{
  "name": "test-project",
  "scripts": {
    "dev": "vite",
    "build": "vite build", 
    "preview": "vite preview",
    "lint": "eslint . --ext js,jsx,ts,tsx"
  }
}
`;

console.log('测试package.json内容:');
console.log(testPackageJson);

console.log('\n测试提取结果:');
try {
	const packageJson = JSON.parse(testPackageJson);
	const scripts = packageJson.scripts;

	console.log('scripts对象键的顺序:');
	const scriptKeys = Object.keys(scripts);
	scriptKeys.forEach((key, index) => {
		console.log(`${index + 1}. ${key}: ${scripts[key]}`);
	});

	console.log('\n预期顺序: dev, build, preview, lint');
	console.log('实际顺序:', scriptKeys.join(', '));
	const expectedOrder = 'dev,build,preview,lint';
	const actualOrder = scriptKeys.join(',');
	console.log('顺序正确:', actualOrder === expectedOrder ? '✅' : '❌');
	console.log('比较:', `"${actualOrder}" === "${expectedOrder}"`);
} catch (error) {
	console.error('解析失败:', error.message);
}
