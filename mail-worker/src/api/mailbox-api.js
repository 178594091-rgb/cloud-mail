import app from '../hono/hono';
import result from '../model/result';
import mailboxApiService from '../service/mailbox-api-service';

app.post('/mailboxApi/create', async (c) => {
	const data = await mailboxApiService.create(c, await c.req.json());
	return c.json(result.ok(data));
});

app.get('/mailbox/code/:token', async (c) => {
	const data = await mailboxApiService.latestCode(c, c.req.param('token'), c.req.query());
	if (c.req.query('plain') === '1') {
		return c.text(data?.code || '', data ? 200 : 204);
	}
	return c.json(result.ok(data));
});
