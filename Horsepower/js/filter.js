


// TODO - adjust alpha based on mount quality
export class AdaptiveKalman {
  constructor({ Q = 0.01, R = 1, alpha = 0.01 } = {}) {
    this.Q = Q;
    this.R = R;
    this.alpha = alpha;
    this.x = 0;
    this.P = 1;
  }

  update(z) {
    this.P += this.Q;
    const K = this.P / (this.P + this.R);
    const y = z - this.x;
    this.x += K * y;
    this.P = (1 - K) * this.P;
    this.R = (1 - this.alpha) * this.R + this.alpha * (y * y);
    return this.x;
  }
}



export class ExponentialSmooth {
  constructor({alpha = 0.2}) {
    this.alpha = alpha;
    this.value = null;
  }
  update(x) {
    if (this.value == null) return this.value = x;
    this.value = this.alpha * x + (1 - this.alpha) * this.value;
    return this.value;
  }
}

