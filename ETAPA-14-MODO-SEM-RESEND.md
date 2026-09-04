# Etapa 14 - Produção temporariamente sem Resend

## Objetivo

Permitir a inicialização segura em produção sem credenciais do Resend, mantendo uma confirmação explícita no ambiente e sem usar valores falsos.

## Configuração temporária

```env
MAIL_PROVIDER=disabled
ALLOW_DISABLED_MAIL_IN_PRODUCTION=true
RESEND_API_KEY=
```

## Limitações conhecidas

- Convites não são entregues por e-mail.
- Recuperações de senha não são entregues por e-mail.
- O administrador precisa criar acessos com senha conhecida ou administrar as contas manualmente.
- O healthcheck considera a configuração pronta porque a ausência de e-mail foi autorizada explicitamente, não porque existe entrega de mensagens.

## Ativação futura do Resend

```env
MAIL_PROVIDER=resend
ALLOW_DISABLED_MAIL_IN_PRODUCTION=false
RESEND_API_KEY=SUA_CHAVE
MAIL_FROM=Academy Play <no-reply@seudominio.com>
```

Depois da alteração, reinicie a API e o worker e valide `/api/health/ready`.
