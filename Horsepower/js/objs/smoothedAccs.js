export function generateSmoothedAcc(smoothingMethod, smoothingParams) {
    return {
        timestamp: null,
        acceleration: {
            x: new smoothingMethod( smoothingParams ),
            y: new smoothingMethod( smoothingParams ),
            z: new smoothingMethod( smoothingParams ),
        },
        rotationRate: {
            x: new smoothingMethod( smoothingParams ),
            y: new smoothingMethod( smoothingParams ),
            z: new smoothingMethod( smoothingParams ),
        },
        accelerationIncludingGravity: {
            x: new smoothingMethod( smoothingParams ),
            y: new smoothingMethod( smoothingParams ),
            z: new smoothingMethod( smoothingParams ),
        }
    };
}


export function updateSmoothedAcc(smoothMethod, accToApply) {
    return {
        timestamp: accToApply.timestamp,
        acceleration: {
            x: smoothMethod.acceleration.x.update(accToApply.acceleration.x),
            y: smoothMethod.acceleration.y.update(accToApply.acceleration.y),
            z: smoothMethod.acceleration.z.update(accToApply.acceleration.z),
        },
        rotationRate: {
            x: smoothMethod.rotationRate.x.update(accToApply.rotationRate.x),
            y: smoothMethod.rotationRate.y.update(accToApply.rotationRate.y),
            z: smoothMethod.rotationRate.z.update(accToApply.rotationRate.z),
        },
        accelerationIncludingGravity: {
            x: smoothMethod.accelerationIncludingGravity.x.update(accToApply.accelerationIncludingGravity.x),
            y: smoothMethod.accelerationIncludingGravity.y.update(accToApply.accelerationIncludingGravity.y),
            z: smoothMethod.accelerationIncludingGravity.z.update(accToApply.accelerationIncludingGravity.z),
        }
    }
}