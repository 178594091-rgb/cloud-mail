const CODE_KEYWORD_SOURCE =
	'verification\\s+code|security\\s+code|temporary\\s+(?:verification\\s+)?code|' +
	'one[- ]?time\\s+(?:pass)?code|\\botp\\b|\\bcode\\b|验证码|驗證碼|验证代码|一次性验证码|' +
	'認証コード|認證碼|検証コード|確認コード';

const CODE_KEYWORD_PATTERN = new RegExp(CODE_KEYWORD_SOURCE, 'i');
const CODE_AFTER_COLON_PATTERN = new RegExp(
	`(?:${CODE_KEYWORD_SOURCE})[^\\d\\n]{0,30}?[:：]\\s*([0-9]{5,8})\\b`,
	'i'
);
const CODE_AFTER_IS_PATTERN = new RegExp(
	`(?:${CODE_KEYWORD_SOURCE})[^\\d\\n]{0,40}?(?:is|是)\\s+([0-9]{5,8})\\b`,
	'i'
);
const CODE_AFTER_KEYWORD_PATTERN = new RegExp(
	`(?:${CODE_KEYWORD_SOURCE})\\s+([0-9]{5,8})\\b`,
	'i'
);
const CODE_ON_NEXT_LINE_PATTERN = new RegExp(
	`(?:${CODE_KEYWORD_SOURCE})[^\\d\\n]{0,80}\\n\\s*([0-9]{4,8})\\s*(?:\\n|$)`,
	'i'
);

/**
 * Extract a numeric verification code only when it is strongly associated
 * with a verification-code keyword. This intentionally avoids loose digit
 * matching so dates, timestamps and order numbers are not returned as codes.
 */
export function extractDigitCode(subject = '', body = '') {
	const source = `${subject}\n${body}`;

	if (!CODE_KEYWORD_PATTERN.test(source)) {
		return '';
	}

	for (const pattern of [
		CODE_AFTER_COLON_PATTERN,
		CODE_AFTER_IS_PATTERN,
		CODE_AFTER_KEYWORD_PATTERN,
		CODE_ON_NEXT_LINE_PATTERN,
	]) {
		const match = pattern.exec(source);
		if (match) {
			return match[1];
		}
	}

	return '';
}

/**
 * Validate AI/database output before exposing it as a verification code.
 * Requiring at least one digit rejects model mistakes such as "Enter".
 */
export function normalizeExtractedCode(value) {
	if (typeof value !== 'string') {
		return '';
	}

	const code = value.trim();
	if (!code || code.length > 8 || /\s/.test(code) || !/\d/.test(code)) {
		return '';
	}

	return code;
}
