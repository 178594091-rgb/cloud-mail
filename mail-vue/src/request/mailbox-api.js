import http from '@/axios/index.js'

export function mailboxApiCreate(email, noMsg = false) {
    return http.post('/mailboxApi/create', {email}, {noMsg})
}
