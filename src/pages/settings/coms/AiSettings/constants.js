export const MODEL_OPTIONS = [
	{ value: 'gpt-4.1', label: 'gpt-4.1', provider: 'OpenAI' },
	{ value: 'gpt-4.1-mini', label: 'gpt-4.1-mini', provider: 'OpenAI' },
	{ value: 'gpt-4.1-nano', label: 'gpt-4.1-nano', provider: 'OpenAI' },
	{ value: 'deepseek-chat', label: 'deepseek-chat', provider: 'DeepSeek' },
	{ value: 'deepseek-reasoner', label: 'deepseek-reasoner', provider: 'DeepSeek' },
	{ value: 'codex-cli', label: 'codex (CLI)', provider: 'CLI' }
];

export const inferProvider = model => {
	if (!model) return 'openai';
	if (model === 'codex-cli') return 'codex';
	return model.toLowerCase().startsWith('deepseek-') ? 'deepseek' : 'openai';
};

export const DEFAULT_DEEPSEEK_BASE_URL = 'https://api.deepseek.com/v1';
