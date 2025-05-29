

export function vectorRotation3d(acc, gyro, inverse) {
    const [alphaDeg, betaDeg, gammaDeg] = gyro;

    // Convert to radians
    const alpha = alphaDeg * Math.PI / 180; // Z - yaw
    const beta  = betaDeg * Math.PI / 180;  // X - pitch
    const gamma = gammaDeg * Math.PI / 180; // Y - roll

    const R = makeRotationMatrix(alpha, beta, gamma);
    let Rt;
    if (inverse) {
        // invert with transpose azs is orthogonal
        Rt = R[0].map((_, colIndex) => R.map(row => row[colIndex]));
    } else {
        Rt = R;
    }
    // apply rotation to acc vector
    return {
        x: Rt[0][0] * acc[0] + Rt[0][1] * acc[1] + Rt[0][2] * acc[2],
        y: Rt[1][0] * acc[0] + Rt[1][1] * acc[1] + Rt[1][2] * acc[2],
        z: Rt[2][0] * acc[0] + Rt[2][1] * acc[1] + Rt[2][2] * acc[2],
    };

}

const matrixMultiply = (A, B) =>
    A.map((row, i) =>
        B[0].map((_, j) =>
            row.reduce((sum, _, k) => sum + A[i][k] * B[k][j], 0)
        )
    );

function makeRotationMatrix(alpha, beta, gamma) {
    const Rz = [
        [Math.cos(alpha), -Math.sin(alpha), 0],
        [Math.sin(alpha),  Math.cos(alpha), 0],
        [0, 0, 1]
    ];
    const Rx = [
        [1, 0, 0],
        [0, Math.cos(beta), -Math.sin(beta)],
        [0, Math.sin(beta),  Math.cos(beta)]
    ];
    const Ry = [
        [Math.cos(gamma), 0, Math.sin(gamma)],
        [0, 1, 0],
        [-Math.sin(gamma), 0, Math.cos(gamma)]
    ];
    return matrixMultiply(matrixMultiply(Rz, Ry), Rx);
}

export function rotateEulerAngles(angles, rotation, inverse) {
    const [a1, b1, g1] = angles.map(d => d * Math.PI / 180);    // Input angles
    const [a2, b2, g2] = rotation.map(d => d * Math.PI / 180);  // Rotation to apply

    const R1 = makeRotationMatrix(a1, b1, g1);
    const R2 = makeRotationMatrix(a2, b2, g2);

    const R2_applied = inverse
        ? R2[0].map((_, j) => R2.map(row => row[j])) // transpose
        : R2;

    const R_final = matrixMultiply(R2_applied, R1);

    // Extract Euler angles from resulting rotation matrix (ZXY order)
    const x = Math.asin(-R_final[1][2]);
    const y = Math.atan2(R_final[0][2], R_final[2][2]);
    const z = Math.atan2(R_final[1][0], R_final[1][1]);

    return {
        alpha: z * 180 / Math.PI,
        beta: x * 180 / Math.PI,
        gamma: y * 180 / Math.PI
    };
}