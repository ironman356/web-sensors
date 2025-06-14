

export class Quaternion {
    constructor(w = 1, x = 0, y = 0, z = 0) {
        this.w = w;
        this.x = x;
        this.y = y;
        this.z = z;
    }

    clone() {
        return new Quaternion(this.w, this.x, this.y, this.z);
    }

    getConjugate() {
        return new Quaternion(this.w, -this.x, -this.y, -this.z);
    }

    applyToVector(v) {
        const vecQuat = new Quaternion(0, v[0], v[1], v[2]);
        const qInv = this.getConjugate();
        const qv = this.multiply(vecQuat).multiply(qInv);
        return [qv.x, qv.y, qv.z];
    }

    multiply(q) {
        const w1 = this.w, x1 = this.x, y1 = this.y, z1 = this.z;
        const w2 = q.w, x2 = q.x, y2 = q.y, z2 = q.z;
        return new Quaternion(
            w1 * w2 - x1 * x2 - y1 * y2 - z1 * z2,
            w1 * x2 + x1 * w2 + y1 * z2 - z1 * y2,
            w1 * y2 - x1 * z2 + y1 * w2 + z1 * x2,
            w1 * z2 + x1 * y2 - y1 * x2 + z1 * w2
        );
    }

    // Set from intrinsic Z–X′–Y″ Tait–Bryan angles (yaw–pitch–roll)
    setFromEulerIntrinsic(alpha, beta, gamma) {
        const cz = Math.cos(alpha / 2);
        const sz = Math.sin(alpha / 2);
        const cx = Math.cos(beta / 2);
        const sx = Math.sin(beta / 2);
        const cy = Math.cos(gamma / 2);
        const sy = Math.sin(gamma / 2);

        this.w = cz * cx * cy - sz * sx * sy;
        this.x = cz * sx * cy + sz * cx * sy;
        this.y = cz * cx * sy - sz * sx * cy;
        this.z = sz * cx * cy - cz * sx * sy;

        return this;
    }


    // Returns intrinsic Z–X′–Y″ Tait–Bryan angles
    getEulerIntrinsic() {
        const { w, x, y, z } = this;

        const R = [
            [1 - 2 * (y * y + z * z),     2 * (x * y - z * w),     2 * (x * z + y * w)],
            [    2 * (x * y + z * w), 1 - 2 * (x * x + z * z),     2 * (y * z - x * w)],
            [    2 * (x * z - y * w),     2 * (y * z + x * w), 1 - 2 * (x * x + y * y)]
        ];

        // Extract intrinsic Z-X-Y as extrinsic Y-X-Z
        const beta = Math.asin(-R[1][2]);
        const alpha = Math.atan2(R[0][2], R[2][2]);
        const gamma = Math.atan2(R[1][0], R[1][1]);

        return [alpha, beta, gamma];
    }

    // Rotate (multiply) by another quaternion
    rotate(q) {
        const w1 = this.w, x1 = this.x, y1 = this.y, z1 = this.z;
        const w2 = q.w, x2 = q.x, y2 = q.y, z2 = q.z;

        this.w = w1 * w2 - x1 * x2 - y1 * y2 - z1 * z2;
        this.x = w1 * x2 + x1 * w2 + y1 * z2 - z1 * y2;
        this.y = w1 * y2 - x1 * z2 + y1 * w2 + z1 * x2;
        this.z = w1 * z2 + x1 * y2 - y1 * x2 + z1 * w2;

        return this;
    }
}