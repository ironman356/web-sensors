

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