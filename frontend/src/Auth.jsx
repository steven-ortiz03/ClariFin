import React, { useState } from 'react';
import { Brand, Form, labelField } from './components';
import { api } from './api';
export function Auth({ login }) {
  const [register, set] = useState(false);
  const fields = [
    ...(register
      ? [labelField('name', 'Nombre', { maxLength: 90, autoComplete: 'name' })]
      : []),
    labelField('email', 'Correo electrónico', {
      kind: 'email',
      autoComplete: 'email',
    }),
    labelField('password', 'Contraseña', {
      kind: 'password',
      minLength: register ? 10 : 1,
      autoComplete: register ? 'new-password' : 'current-password',
      placeholder: register ? 'Al menos 10 caracteres' : '',
    }),
  ];
  return (
    <main className="auth">
      <aside>
        <Brand />
        <div className="paperart" aria-hidden="true">
          <i />
          <i />
          <i />
        </div>
        <div>
          <h1>
            Tus finanzas,
            <br />
            <em>cuenta por cuenta.</em>
          </h1>
          <p>
            Registra ingresos y gastos, controla presupuestos y no olvides
            ningún compromiso del mes.
          </p>
        </div>
      </aside>
      <section>
        <h2>{register ? 'Crea tu perfil' : 'Inicia sesión'}</h2>
        <p>Accede a tus cuentas, movimientos y presupuestos.</p>
        <Form
          key={String(register)}
          fields={fields}
          submit={async (b) => {
            if (register) await api('/auth/register', 'POST', b);
            login(
              await api('/auth/login', 'POST', {
                email: b.email,
                password: b.password,
              }),
            );
          }}
          button={register ? 'Crear perfil' : 'Entrar'}
        />
        <button className="link" onClick={() => set(!register)}>
          {register ? 'Ya tengo un perfil' : 'Crear un perfil nuevo'}
        </button>
      </section>
    </main>
  );
}
