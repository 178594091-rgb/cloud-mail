import { and, desc, eq, gt, ne, sql } from 'drizzle-orm';
import BizError from '../error/biz-error';
import account from '../entity/account';
import email from '../entity/email';
import orm from '../entity/orm';
import { emailConst, isDel } from '../const/entity-const';
import accountService from './account-service';
import emailUtils from '../utils/email-utils';
import verifyUtils from '../utils/verify-utils';

const encoder = new TextEncoder();
const decoder = new TextDecoder();

function base64url(input) {
	const value = btoa(String.fromCharCode(...new Uint8Array(input)));
	return value.replace(/=/g, '').replace(/\+/g, '-').replace(/\//g, '_');
}

function base64urlDecode(value) {
	value = value.replace(/-/g, '+').replace(/_/g, '/');
	while (value.length % 4) value += '=';
	return Uint8Array.from(atob(value), character => character.charCodeAt(0));
}

const mailboxApiService = {
	async create(c, params) {
		const mailbox = params.email?.trim().toLowerCase();
		if (!verifyUtils.isEmail(mailbox)) {
			throw new BizError('邮箱地址不正确 Invalid email address');
		}

		const accountRow = await accountService.selectByEmailIncludeDel(c, mailbox);
		if (!accountRow || accountRow.isDel === isDel.DELETE) {
			throw new BizError('邮箱不存在 Mailbox not found');
		}

		const token = await this.sign(c, {
			purpose: 'mailbox-code',
			accountId: accountRow.accountId,
			email: accountRow.email.toLowerCase(),
		});

		return {
			email: accountRow.email,
			apiUrl: `${new URL(c.req.url).origin}/api/mailbox/code/${token}`,
		};
	},

	async latestCode(c, token, params) {
		const payload = await this.verify(c, token);
		if (!payload || payload.purpose !== 'mailbox-code') {
			throw new BizError('邮箱 API 令牌无效 Invalid mailbox API token', 401);
		}

		const accountRow = await orm(c).select().from(account).where(and(
			eq(account.accountId, Number(payload.accountId)),
			sql`${account.email} COLLATE NOCASE = ${payload.email}`,
			eq(account.isDel, isDel.NORMAL),
		)).get();

		if (!accountRow) {
			throw new BizError('邮箱 API 已失效 Mailbox API is no longer valid', 401);
		}

		const afterEmailId = Math.max(0, Number(params.afterEmailId) || 0);
		const emailRow = await orm(c).select({
			emailId: email.emailId,
			code: email.code,
			subject: email.subject,
			text: email.text,
			content: email.content,
			createTime: email.createTime,
		}).from(email).where(and(
			sql`${email.toEmail} COLLATE NOCASE = ${accountRow.email}`,
			gt(email.emailId, afterEmailId),
			eq(email.type, emailConst.type.RECEIVE),
			eq(email.isDel, isDel.NORMAL),
			ne(email.status, emailConst.status.SAVING),
		)).orderBy(desc(email.emailId)).limit(1).get();

		if (!emailRow) return null;

		return {
			emailId: emailRow.emailId,
			code: emailRow.code || this.extractCode(emailRow),
			createTime: emailRow.createTime,
		};
	},

	extractCode(emailRow) {
		const content = [
			emailRow.subject || '',
			emailRow.text || '',
			emailUtils.htmlToText(emailRow.content || ''),
		].join('\n');

		const keywordMatch = content.match(
			/(?:验证码|校验码|动态码|verification\s*code|security\s*code|one[-\s]*time\s*(?:password|code)|otp)[^a-z0-9]{0,24}([a-z0-9]{4,8})/iu
		);
		if (keywordMatch) return keywordMatch[1];

		return content.match(/(?<!\d)\d{4,8}(?!\d)/)?.[0] || '';
	},

	async sign(c, payload) {
		const payloadValue = base64url(encoder.encode(JSON.stringify(payload)));
		const key = await crypto.subtle.importKey(
			'raw',
			encoder.encode(c.env.jwt_secret),
			{ name: 'HMAC', hash: 'SHA-256' },
			false,
			['sign'],
		);
		const signature = await crypto.subtle.sign('HMAC', key, encoder.encode(payloadValue));
		return `${payloadValue}.${base64url(signature)}`;
	},

	async verify(c, token) {
		try {
			const [payloadValue, signatureValue, extra] = token.split('.');
			if (!payloadValue || !signatureValue || extra) return null;

			const key = await crypto.subtle.importKey(
				'raw',
				encoder.encode(c.env.jwt_secret),
				{ name: 'HMAC', hash: 'SHA-256' },
				false,
				['verify'],
			);
			const valid = await crypto.subtle.verify(
				'HMAC',
				key,
				base64urlDecode(signatureValue),
				encoder.encode(payloadValue),
			);
			if (!valid) return null;

			return JSON.parse(decoder.decode(base64urlDecode(payloadValue)));
		} catch (error) {
			return null;
		}
	},
};

export default mailboxApiService;
