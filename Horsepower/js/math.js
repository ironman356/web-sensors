

export function vectorRotation3d(acc, rotation, inverse) {
    const [alphaDeg, betaDeg, gammaDeg] = rotation;

    //  to radians
    const alpha = alphaDeg * Math.PI / 180; // Z - yaw
    const beta  = betaDeg * Math.PI / 180;  // X - pitch
    const gamma = gammaDeg * Math.PI / 180; // Y - roll

    const R = makeRotationMatrix(alpha, beta, gamma);
    let Rt;
    if (inverse) {
        Rt = transposeMatrix(R);
    } else {
        Rt = R;
    }

    const result = matrixMultiply(Rt, acc);

    return {
        x: result[0],
        y: result[1],
        z: result[2],
    };

}

const matrixMultiply = (A, B) =>
    A.map((row, i) =>
        B[0].map((_, j) =>
            row.reduce((sum, _, k) => sum + A[i][k] * B[k][j], 0)
        )
    );

function transposeMatrix(matrix) {
  return matrix[0].map((_, colIndex) => matrix.map(row => row[colIndex]));
}

function makeRotationMatrix(alpha, beta, gamma) {
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
    const Rz = [
        [Math.cos(alpha), -Math.sin(alpha), 0],
        [Math.sin(alpha),  Math.cos(alpha), 0],
        [0, 0, 1]
    ];

    return matrixMultiply(matrixMultiply(Rz, Rx), Ry);
}

export function rotateEulerAngles(angles, rotation, inverse) {
    const [aIn, bIn, gIn] = angles.map(d => d * Math.PI / 180);    // input angles
    const [aRot, bRot, gRot] = rotation.map(d => d * Math.PI / 180);  // rotation to apply

    const rIn = makeRotationMatrix(aIn, bIn, gIn);
    const rRot = makeRotationMatrix(aRot, bRot, gRot);
    let RT;
    if (inverse) {
        RT = transposeMatrix(rRot);
    } else {
        RT = rRot;
    }

    const R_final = matrixMultiply(RT, rIn);
    return getEulerAnglesFromMatrix(R_final);
}


function getEulerAnglesFromMatrix(R) {
    const sy = Math.sqrt(R[0][0] * R[0][0] + R[1][0] * R[1][0]);

    const singular = sy < 1e-5;
    let alpha, beta, gamma;

    if (!singular) {
        alpha = Math.atan2(R[1][0], R[0][0]); // Z
        beta = Math.atan2(-R[2][0], sy);      // X
        gamma = Math.atan2(R[2][1], R[2][2]); // Y
    } else {
        alpha = Math.atan2(-R[0][1], R[1][1]); // Z
        beta = Math.atan2(-R[2][0], sy);       // X
        gamma = 0;                             // Y
    }

    // to degrees
    return {
        alpha: alpha * 180 / Math.PI,
        beta: beta * 180 / Math.PI,
        gamma: gamma * 180 / Math.PI
    };
}


/**
 * im going to switch to quaternion for this becuase i am going insane
 * euler angles good for monkey brain but this math is absolutely awful
 * i have spent 3 days trying to get euler angles to work and it just aint
 * i get output that looks correct but isn't and i cant find any useful resources
 */