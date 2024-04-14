import { SimulationConfig } from "./config.js";
import { ix, forEachCell } from "./utils.js";

export class FluidSolver {
  u: Float32Array;
  v: Float32Array;
  u_prev: Float32Array;
  v_prev: Float32Array;
  r_dens: Float32Array;
  r_dens_prev: Float32Array;
  g_dens: Float32Array;
  g_dens_prev: Float32Array;
  b_dens: Float32Array;
  b_dens_prev: Float32Array;
  tmp: Float32Array;
  config: SimulationConfig;

  constructor(config: SimulationConfig) {
    this.u = new Float32Array(config.size());
    this.v = new Float32Array(config.size());
    this.u_prev = new Float32Array(config.size());
    this.v_prev = new Float32Array(config.size());
    this.r_dens = new Float32Array(config.size());
    this.r_dens_prev = new Float32Array(config.size());
    this.g_dens = new Float32Array(config.size());
    this.g_dens_prev = new Float32Array(config.size());
    this.b_dens = new Float32Array(config.size());
    this.b_dens_prev = new Float32Array(config.size());
    this.tmp = new Float32Array(config.size());
    this.config = config;
  }

  private swap(x0: Float32Array, x: Float32Array) {
    this.tmp.set(x0);
    x0.set(x);
    x.set(this.tmp);
  }

  private add_source(x: Float32Array, s: Float32Array) {
    for (let i = 0; i < this.config.size(); i++) x[i] += this.config.dt * s[i];
  }

  private set_bnd(b: number, x: Float32Array) {
    for (let i = 1; i <= this.config.N; i++) {
      x[ix(0, i, this.config)] =
        b == 1 ? -x[ix(1, i, this.config)] : x[ix(1, i, this.config)];
      x[ix(this.config.N + 1, i, this.config)] =
        b == 1
          ? -x[ix(this.config.N, i, this.config)]
          : x[ix(this.config.N, i, this.config)];
      x[ix(i, 0, this.config)] =
        b == 2 ? -x[ix(i, 1, this.config)] : x[ix(i, 1, this.config)];
      x[ix(i, this.config.N + 1, this.config)] =
        b == 2
          ? -x[ix(i, this.config.N, this.config)]
          : x[ix(i, this.config.N, this.config)];
    }
    x[ix(0, 0, this.config)] =
      0.5 * (x[ix(1, 0, this.config)] + x[ix(0, 1, this.config)]);
    x[ix(0, this.config.N + 1, this.config)] =
      0.5 *
      (x[ix(1, this.config.N + 1, this.config)] +
        x[ix(0, this.config.N, this.config)]);
    x[ix(this.config.N + 1, 0, this.config)] =
      0.5 *
      (x[ix(this.config.N, 0, this.config)] +
        x[ix(this.config.N + 1, 1, this.config)]);
    x[ix(this.config.N + 1, this.config.N + 1, this.config)] =
      0.5 *
      (x[ix(this.config.N, this.config.N + 1, this.config)] +
        x[ix(this.config.N + 1, this.config.N, this.config)]);
  }

  private lin_solve(
    b: number,
    x: Float32Array,
    x0: Float32Array,
    a: number,
    c: number
  ) {
    for (let k = 0; k < 10; k++) {
      forEachCell(this.config, (i, j) => {
        x[ix(i, j, this.config)] =
          (x0[ix(i, j, this.config)] +
            a *
              (x[ix(i - 1, j, this.config)] +
                x[ix(i + 1, j, this.config)] +
                x[ix(i, j - 1, this.config)] +
                x[ix(i, j + 1, this.config)])) /
          c;
      });
      this.set_bnd(b, x);
    }
  }

  private diffuse(b: number, x: Float32Array, x0: Float32Array) {
    let a = this.config.dt * this.config.diff * this.config.N * this.config.N;
    this.lin_solve(b, x, x0, a, 1 + 4 * a);
  }

  private advect(
    b: number,
    d: Float32Array,
    d0: Float32Array,
    u: Float32Array,
    v: Float32Array
  ) {
    let i0: number, j0: number, i1: number, j1: number;
    let x: number,
      y: number,
      s0: number,
      t0: number,
      s1: number,
      t1: number,
      dt0: number;

    dt0 = this.config.dt * this.config.N;
    forEachCell(this.config, (i, j) => {
      x = i - dt0 * u[ix(i, j, this.config)];
      y = j - dt0 * v[ix(i, j, this.config)];
      if (x < 0.5) x = 0.5;
      if (x > this.config.N + 0.5) x = this.config.N + 0.5;
      i0 = Math.floor(x);
      i1 = i0 + 1;
      if (y < 0.5) y = 0.5;
      if (y > this.config.N + 0.5) y = this.config.N + 0.5;
      j0 = Math.floor(y);
      j1 = j0 + 1;
      s1 = x - i0;
      s0 = 1 - s1;
      t1 = y - j0;
      t0 = 1 - t1;
      d[ix(i, j, this.config)] =
        s0 *
          (t0 * d0[ix(i0, j0, this.config)] +
            t1 * d0[ix(i0, j1, this.config)]) +
        s1 *
          (t0 * d0[ix(i1, j0, this.config)] + t1 * d0[ix(i1, j1, this.config)]);
    });
    this.set_bnd(b, d);
  }

  private project(
    u: Float32Array,
    v: Float32Array,
    p: Float32Array,
    div: Float32Array
  ) {
    forEachCell(this.config, (i, j) => {
      div[ix(i, j, this.config)] =
        (-0.5 *
          (u[ix(i + 1, j, this.config)] -
            u[ix(i - 1, j, this.config)] +
            v[ix(i, j + 1, this.config)] -
            v[ix(i, j - 1, this.config)])) /
        this.config.N;
      p[ix(i, j, this.config)] = 0;
    });
    this.set_bnd(0, div);
    this.set_bnd(0, p);

    this.lin_solve(0, p, div, 1, 4);

    forEachCell(this.config, (i, j) => {
      u[ix(i, j, this.config)] -=
        0.5 *
        this.config.N *
        (p[ix(i + 1, j, this.config)] - p[ix(i - 1, j, this.config)]);
      v[ix(i, j, this.config)] -=
        0.5 *
        this.config.N *
        (p[ix(i, j + 1, this.config)] - p[ix(i, j - 1, this.config)]);
    });
    this.set_bnd(1, u);
    this.set_bnd(2, v);
  }

  private dens_step(x: Float32Array, x0: Float32Array) {
    this.add_source(x, x0);
    this.swap(x0, x);
    this.diffuse(0, x, x0);
    this.swap(x0, x);
    this.advect(0, x, x0, this.u, this.v);
  }

  dens_steps() {
    this.dens_step(this.r_dens, this.r_dens_prev);
    this.dens_step(this.g_dens, this.g_dens_prev);
    this.dens_step(this.b_dens, this.b_dens_prev);
  }

  vel_step() {
    this.add_source(this.u, this.u_prev);
    this.add_source(this.v, this.v_prev);
    this.swap(this.u_prev, this.u);
    this.diffuse(1, this.u, this.u_prev);
    this.swap(this.v_prev, this.v);
    this.diffuse(2, this.v, this.v_prev);
    this.project(this.u, this.v, this.u_prev, this.v_prev);
    this.swap(this.u_prev, this.u);
    this.swap(this.v_prev, this.v);
    this.advect(1, this.u, this.u_prev, this.u_prev, this.v_prev);
    this.advect(2, this.v, this.v_prev, this.u_prev, this.v_prev);
    this.project(this.u, this.v, this.u_prev, this.v_prev);
  }
}
