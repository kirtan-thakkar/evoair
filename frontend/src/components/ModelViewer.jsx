import React, { useRef, useEffect } from 'react';
import '@google/model-viewer';

const ModelViewer = ({ src = '/HEER_AS-10-1000010.glb', alt = 'Evo Air Device 3D Model' }) => {
  const modelRef = useRef(null);

  useEffect(() => {
    const modelViewer = modelRef.current;
    if (!modelViewer) return;

    const applyMatteBlack = () => {
      const materials = modelViewer.model?.materials;
      if (materials) {
        materials.forEach((material) => {
          if (material.pbrMetallicRoughness) {
            material.pbrMetallicRoughness.setBaseColorFactor([0.02, 0.02, 0.02, 1]);
            material.pbrMetallicRoughness.setRoughnessFactor(0.85);
            material.pbrMetallicRoughness.setMetallicFactor(0.3);
          }
        });
      }
    };

    if (modelViewer.model) {
      applyMatteBlack();
    }

    modelViewer.addEventListener('load', applyMatteBlack);
    return () => {
      modelViewer.removeEventListener('load', applyMatteBlack);
    };
  }, []);

  return (
    <div
      style={{
        width: '100%',
        height: '500px',
        display: 'flex',
        justifyContent: 'center',
        alignItems: 'center',
        animation: 'softHover 4s ease-in-out infinite alternate'
      }}
    >
      <style>
        {`
          @keyframes softHover {
            from { transform: translateY(10px); }
            to { transform: translateY(-10px); }
          }
          @keyframes pulseLight {
            0% { filter: drop-shadow(0 0 8px rgba(252, 66, 255, 0.05)) drop-shadow(0 0 8px rgba(66, 252, 255, 0.05)); }
            50% { filter: drop-shadow(0 0 32px rgba(252, 66, 255, 0.35)) drop-shadow(0 0 32px rgba(66, 252, 255, 0.35)); }
            100% { filter: drop-shadow(0 0 8px rgba(252, 66, 255, 0.05)) drop-shadow(0 0 8px rgba(66, 252, 255, 0.05)); }
          }
          .ambient-lit-model {
            width: 100%;
            height: 100%;
            background-color: transparent;
            animation: pulseLight 3.45s ease-in-out infinite;
            --poster-color: transparent;
          }
        `}
      </style>
      <model-viewer
        ref={modelRef}
        src={src}
        alt={alt}
        interaction-prompt="none"
        environment-image="legacy"
        exposure="1.1"
        camera-orbit="90deg 90deg 118%"
        field-of-view="auto"
        bounds="tight"
        className="ambient-lit-model"
        style={{ width: '100%', height: '100%', outline: 'none' }}
      />
    </div>
  );
};

export default ModelViewer;
