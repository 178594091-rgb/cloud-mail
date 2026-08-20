import emailUtils from '../utils/email-utils';
import { settingConst } from '../const/entity-const';
import { extractDigitCode, normalizeExtractedCode } from '../utils/verification-code-utils';

const aiService = {
	async extractCode(c, email, options = {}) {
		if (!this.shouldExtractCode(options.aiCode, options.aiCodeFilter, email)) {
			return '';
		}

		const subject = email.subject || '';
		const text = emailUtils.formatText(email.text || '');
		const htmlText = emailUtils.htmlToText(email.html || '');
		const body = htmlText || text;

		if (!subject && !body) {
			return '';
		}

		// Prefer deterministic extraction for ordinary numeric codes. This
		// prevents the model from returning nearby instructions such as "Enter".
		const regexCode = extractDigitCode(subject, body.slice(0, 6000));
		if (regexCode) {
			return regexCode;
		}

		try {
			const result = await c.env.ai.run(c.env.ai_model || '@cf/meta/llama-3.1-8b-instruct-fast', {
				messages: [
					{
						role: 'system',
						content: 'You extract verification codes from emails. A verification code is a short code, usually 4-8 digits, or occasionally a short alphanumeric string, placed near the word "code" in the email. Return only JSON like {"code":"123456"} or {"code":""} when no code is found. The code must be 8 characters or fewer and must not contain spaces. Never return common words such as "Enter", "Click", or "Continue". If you are not confident, return {"code":""}. Do not explain.'
					},
					{
						role: 'user',
						content: `Subject: ${subject}\n\n${body.slice(0, 6000)}`
					}
				],
				temperature: 0,
				max_tokens: 32
			});

			const content = typeof result === 'string' ? result : result?.response || '';
			const json = JSON.parse(content);
			return normalizeExtractedCode(json.code);
		} catch (e) {
			console.error('验证码提取失败: ', e);
			return '';
		}
	},

	shouldExtractCode(aiCode, aiCodeFilterStr, email) {
		if (aiCode !== settingConst.aiCode.OPEN) {
			return false;
		}

		const filterList = aiCodeFilterStr ? aiCodeFilterStr.split(',').map(item => item.trim().toLowerCase()).filter(Boolean) : [];

		if (filterList.length === 0) {
			return true;
		}

		const fromEmail = (email.from?.address || '').trim().toLowerCase();
		const fromDomain = emailUtils.getDomain(fromEmail).toLowerCase();

		return filterList.some(item => item === fromEmail || item === fromDomain);
	}
};

export default aiService;
