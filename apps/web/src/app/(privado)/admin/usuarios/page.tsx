'use client';

import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useAuth } from '../../../../lib/auth-context';
import { ApiError, apiFetch } from '../../../../lib/api-client';

interface Usuario {
  id: string;
  username: string;
  email: string;
  activo: boolean;
  mfaHabilitado: boolean;
  roles: string[];
  creadoEn: string;
}

interface CatRol {
  codigo: string;
  nombre: string;
}

interface FormNuevoUsuario {
  username: string;
  email: string;
  password: string;
  roles: string[];
}

function formInicial(): FormNuevoUsuario {
  return { username: '', email: '', password: '', roles: [] };
}

export default function UsuariosPage() {
  const { sesion } = useAuth();
  const token = sesion?.accessToken;
  const queryClient = useQueryClient();
  const [form, setForm] = useState<FormNuevoUsuario>(formInicial());
  const [errorCrear, setErrorCrear] = useState<string | null>(null);
  const [edicionRolesId, setEdicionRolesId] = useState<string | null>(null);
  const [rolesEnEdicion, setRolesEnEdicion] = useState<string[]>([]);

  const { data: usuarios, isLoading } = useQuery({
    queryKey: ['usuarios'],
    queryFn: () => apiFetch<Usuario[]>('/usuarios', { token }),
    enabled: Boolean(token),
  });

  const { data: roles } = useQuery({
    queryKey: ['cat-rol'],
    queryFn: () => apiFetch<{ items: CatRol[] }>('/catalogos/CAT-DTE-04', { token }),
    enabled: Boolean(token),
  });

  const mutCrear = useMutation({
    mutationFn: () => apiFetch('/usuarios', { method: 'POST', token, body: form }),
    onSuccess: () => {
      setForm(formInicial());
      setErrorCrear(null);
      queryClient.invalidateQueries({ queryKey: ['usuarios'] });
    },
    onError: (err) => setErrorCrear(err instanceof ApiError ? `${err.message} (${err.codigo})` : 'Error al crear usuario'),
  });

  const mutActualizarRoles = useMutation({
    mutationFn: (vars: { id: string; roles: string[] }) =>
      apiFetch(`/usuarios/${vars.id}/roles`, { method: 'PUT', token, body: { roles: vars.roles } }),
    onSuccess: () => {
      setEdicionRolesId(null);
      queryClient.invalidateQueries({ queryKey: ['usuarios'] });
    },
  });

  function alternarRolForm(codigo: string) {
    setForm((f) => ({ ...f, roles: f.roles.includes(codigo) ? f.roles.filter((r) => r !== codigo) : [...f.roles, codigo] }));
  }

  function alternarRolEdicion(codigo: string) {
    setRolesEnEdicion((r) => (r.includes(codigo) ? r.filter((x) => x !== codigo) : [...r, codigo]));
  }

  return (
    <div className="space-y-6">
      <h1 className="text-lg font-semibold text-gray-900">Usuarios</h1>

      <form
        data-testid="form-crear-usuario"
        className="space-y-3 rounded border border-gray-200 bg-white p-4"
        onSubmit={(e) => {
          e.preventDefault();
          mutCrear.mutate();
        }}
      >
        <h2 className="text-sm font-semibold text-gray-900">Nuevo usuario</h2>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
          <input
            data-testid="input-username-nuevo"
            required
            placeholder="Usuario"
            className="rounded border border-gray-300 px-2 py-1 text-sm"
            value={form.username}
            onChange={(e) => setForm({ ...form, username: e.target.value })}
          />
          <input
            data-testid="input-email-nuevo"
            required
            type="email"
            placeholder="Email"
            className="rounded border border-gray-300 px-2 py-1 text-sm"
            value={form.email}
            onChange={(e) => setForm({ ...form, email: e.target.value })}
          />
          <input
            data-testid="input-password-nuevo"
            required
            type="password"
            placeholder="Contraseña (mín. 12)"
            className="rounded border border-gray-300 px-2 py-1 text-sm"
            value={form.password}
            onChange={(e) => setForm({ ...form, password: e.target.value })}
          />
        </div>
        <div className="flex flex-wrap gap-2">
          {roles?.items.map((r) => (
            <label key={r.codigo} className="flex items-center gap-1 text-xs text-gray-700">
              <input
                type="checkbox"
                data-testid={`checkbox-rol-nuevo-${r.codigo}`}
                checked={form.roles.includes(r.codigo)}
                onChange={() => alternarRolForm(r.codigo)}
              />
              {r.nombre}
            </label>
          ))}
        </div>
        {errorCrear && <p className="text-sm text-red-700">{errorCrear}</p>}
        <button
          type="submit"
          data-testid="btn-crear-usuario"
          disabled={mutCrear.isPending || form.roles.length === 0}
          className="rounded bg-gray-900 px-4 py-1.5 text-sm text-white disabled:opacity-50"
        >
          {mutCrear.isPending ? 'Creando...' : 'Crear usuario'}
        </button>
      </form>

      {isLoading && <p>Cargando usuarios...</p>}
      {usuarios && (
        <div className="overflow-x-auto rounded border border-gray-200 bg-white">
          <table className="min-w-full text-sm" data-testid="tabla-usuarios">
            <thead className="bg-gray-50 text-left text-xs uppercase text-gray-500">
              <tr>
                <th className="px-3 py-2">Usuario</th>
                <th className="px-3 py-2">Email</th>
                <th className="px-3 py-2">Roles</th>
                <th className="px-3 py-2">Activo</th>
                <th className="px-3 py-2">MFA</th>
                <th className="px-3 py-2">Acción</th>
              </tr>
            </thead>
            <tbody>
              {usuarios.map((u) => (
                <tr key={u.id} className="border-t border-gray-100" data-testid="fila-usuario">
                  <td className="px-3 py-2">{u.username}</td>
                  <td className="px-3 py-2">{u.email}</td>
                  <td className="px-3 py-2">
                    {edicionRolesId === u.id ? (
                      <div className="flex flex-wrap gap-2">
                        {roles?.items.map((r) => (
                          <label key={r.codigo} className="flex items-center gap-1 text-xs">
                            <input
                              type="checkbox"
                              data-testid={`checkbox-rol-edicion-${u.id}-${r.codigo}`}
                              checked={rolesEnEdicion.includes(r.codigo)}
                              onChange={() => alternarRolEdicion(r.codigo)}
                            />
                            {r.nombre}
                          </label>
                        ))}
                      </div>
                    ) : (
                      u.roles.join(', ')
                    )}
                  </td>
                  <td className="px-3 py-2">{u.activo ? 'Sí' : 'No'}</td>
                  <td className="px-3 py-2">{u.mfaHabilitado ? 'Sí' : 'No'}</td>
                  <td className="px-3 py-2">
                    {edicionRolesId === u.id ? (
                      <div className="flex gap-2">
                        <button
                          data-testid={`btn-guardar-roles-${u.id}`}
                          onClick={() => mutActualizarRoles.mutate({ id: u.id, roles: rolesEnEdicion })}
                          className="rounded bg-gray-900 px-2 py-1 text-xs text-white"
                        >
                          Guardar
                        </button>
                        <button onClick={() => setEdicionRolesId(null)} className="rounded border border-gray-300 px-2 py-1 text-xs">
                          Cancelar
                        </button>
                      </div>
                    ) : (
                      <button
                        data-testid={`btn-editar-roles-${u.id}`}
                        onClick={() => {
                          setEdicionRolesId(u.id);
                          setRolesEnEdicion(u.roles);
                        }}
                        className="rounded border border-gray-300 px-2 py-1 text-xs text-gray-700"
                      >
                        Editar roles
                      </button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
