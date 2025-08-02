

// export function vectorRotation3d(acc, rotation, inverse) {
//     const [alphaDeg, betaDeg, gammaDeg] = rotation;

//     //  to radians
//     const alpha = alphaDeg * Math.PI / 180; // Z - yaw
//     const beta  = betaDeg * Math.PI / 180;  // X - pitch
//     const gamma = gammaDeg * Math.PI / 180; // Y - roll

//     const R = makeRotationMatrix(alpha, beta, gamma);
//     let Rt;
//     if (inverse) {
//         Rt = transposeMatrix(R);
//     } else {
//         Rt = R;
//     }

//     const result = matrixMultiply(Rt, acc);

//     return {
//         x: result[0],
//         y: result[1],
//         z: result[2],
//     };

// }

// const matrixMultiply = (A, B) =>
//     A.map((row, i) =>
//         B[0].map((_, j) =>
//             row.reduce((sum, _, k) => sum + A[i][k] * B[k][j], 0)
//         )
//     );

// function transposeMatrix(matrix) {
//   return matrix[0].map((_, colIndex) => matrix.map(row => row[colIndex]));
// }

// function makeRotationMatrix(alpha, beta, gamma) {
//     const Rx = [
//         [1, 0, 0],
//         [0, Math.cos(beta), -Math.sin(beta)],
//         [0, Math.sin(beta),  Math.cos(beta)]
//     ];
//     const Ry = [
//         [Math.cos(gamma), 0, Math.sin(gamma)],
//         [0, 1, 0],
//         [-Math.sin(gamma), 0, Math.cos(gamma)]
//     ];
//     const Rz = [
//         [Math.cos(alpha), -Math.sin(alpha), 0],
//         [Math.sin(alpha),  Math.cos(alpha), 0],
//         [0, 0, 1]
//     ];

//     return matrixMultiply(matrixMultiply(Rz, Rx), Ry);
// }

// export function rotateEulerAngles(angles, rotation, inverse) {
//     const [aIn, bIn, gIn] = angles.map(d => d * Math.PI / 180);    // input angles
//     const [aRot, bRot, gRot] = rotation.map(d => d * Math.PI / 180);  // rotation to apply

//     const rIn = makeRotationMatrix(aIn, bIn, gIn);
//     const rRot = makeRotationMatrix(aRot, bRot, gRot);
//     let RT;
//     if (inverse) {
//         RT = transposeMatrix(rRot);
//     } else {
//         RT = rRot;
//     }

//     const R_final = matrixMultiply(RT, rIn);
//     return getEulerAnglesFromMatrix(R_final);
// }


// function getEulerAnglesFromMatrix(R) {
//     const sy = Math.sqrt(R[0][0] * R[0][0] + R[1][0] * R[1][0]);

//     const singular = sy < 1e-5;
//     let alpha, beta, gamma;

//     if (!singular) {
//         alpha = Math.atan2(R[1][0], R[0][0]); // Z
//         beta = Math.atan2(-R[2][0], sy);      // X
//         gamma = Math.atan2(R[2][1], R[2][2]); // Y
//     } else {
//         alpha = Math.atan2(-R[0][1], R[1][1]); // Z
//         beta = Math.atan2(-R[2][0], sy);       // X
//         gamma = 0;                             // Y
//     }

//     // to degrees
//     return {
//         alpha: alpha * 180 / Math.PI,
//         beta: beta * 180 / Math.PI,
//         gamma: gamma * 180 / Math.PI
//     };
// }


function toXYearth(lat, lon, lat0, lon0) {
    const R = 6371000; // earth radius in meters
    const dLat = (lat - lat0) * Math.PI / 180;
    const dLon = (lon - lon0) * Math.PI / 180;
    const x = R * dLon * Math.cos(lat0 * Math.PI / 180);
    const y = R * dLat;
    return [x, y];
}

export function pointToLineDist(p1, p2, p3) {
    // p1 = start, p3 = end, p2 = point to check
    const lat0 = p1.latitude;
    const lon0 = p1.longitude;

    const A = toXYearth(p1.latitude, p1.longitude, lat0, lon0);
    const B = toXYearth(p2.latitude, p2.longitude, lat0, lon0);
    const C = toXYearth(p3.latitude, p3.longitude, lat0, lon0);

    const AC = [C[0] - A[0], C[1] - A[1]];
    const AB = [B[0] - A[0], B[1] - A[1]];

    const cross = Math.abs(AC[0] * AB[1] - AC[1] * AB[0]);
    const len = Math.hypot(AC[0], AC[1]);

    return cross / len; // distance in meters
} 


/**
 * isolate gravity vec via acceleration w/gravity - linear acceleration
 * @param {*} vec vector with accelerationIncludingGravity && acceleration properties
 * @returns vector with only xyz properties being gravity
 */
export function getGravity(vec) {
    return {
        x: vec.accelerationIncludingGravity.x - vec.acceleration.x,
        y: vec.accelerationIncludingGravity.y - vec.acceleration.y,
        z: vec.accelerationIncludingGravity.z - vec.acceleration.z,
    };
}
/**
 * Adds vec2 to vec1 preserving vec1's other properties
 * @param {*} vec1 
 * @param {*} vec2 
 * @returns 
 */
export function addVectors(vec1, vec2) {
    vec1.x += vec2.x;
    vec1.y += vec2.y;
    vec1.z += vec2.z;
    return vec1;
}
/**
 * gets magnitude of vector based on its xyz peroperties
 * @param {*} vec 
 * @returns number
 */
export function xyzMagnitude(vec) {
    const net = vec.x**2 + vec.y**2 + vec.z**2;
    return Math.sqrt(net);
}
/**
 * Distance between 2 objects based on xyz peroperties of passed object
 * @param {*} vec1 
 * @param {*} vec2 
 */
export function xyzDistance(vec1, vec2) {
    let result = 0;
    result += (vec1.x - vec2.x)**2;
    result += (vec1.y - vec2.y)**2;
    result += (vec1.z - vec2.z)**2;
    return Math.sqrt(result);
}
export function xyzToMatrix(obj) {
    return [obj.x, obj.y, obj.z];
}
export function matrixToXYZ(arr) {
    return {
        x: arr[0],
        y: arr[1],
        z: arr[2],
    }
}
export function makeMountMatrix(down, forward) {
    // right hand rule z up 
    const z = matrixNormalize([-down.x, -down.y, -down.z]); // pos z = up
    const y = matrixNormalize([forward.x, forward.y, forward.z]); 
    const x = matrixNormalize(matrixCross(y, z));
    const y_corrected = matrixCross(z, x);  // recomputed to ensure orthogonal
    // x will be orthogonal, y_corrected is on the same plane as yz just also orthogonal to z & x

    return [
        [x[0], y_corrected[0], -z[0]],
        [x[1], y_corrected[1], -z[1]],
        [x[2], y_corrected[2], -z[2]],
    ];
}
export function matrixNormalize(vec) {
    const length = Math.sqrt(vec[0]**2 + vec[1]**2 + vec[2]**2);
    if (length === 0) return { x:0, y:0, z:0 };
    return [vec[0]/length, vec[1]/length, vec[2]/length];
}
export function matrixCross(a, b) {
    return [
        a[1]*b[2] - a[2]*b[1],
        a[2]*b[0] - a[0]*b[2],
        a[0]*b[1] - a[1]*b[0]
    ];
}
export function matrixTranspose(m) {
    return [
        [m[0][0], m[1][0], m[2][0]],
        [m[0][1], m[1][1], m[2][1]],
        [m[0][2], m[1][2], m[2][2]],
    ];
}
export function applyRotationMatrix(m, v) {
    return [
        m[0][0]*v[0] + m[1][0]*v[1] + m[2][0]*v[2],
        m[0][1]*v[0] + m[1][1]*v[1] + m[2][1]*v[2],
        m[0][2]*v[0] + m[1][2]*v[1] + m[2][2]*v[2],
    ];
}
export function radToDeg(rad) {
    return rad * 180 / Math.PI;
}