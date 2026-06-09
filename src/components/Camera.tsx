import React, { useRef, useState, useCallback } from 'react';
import { Camera as CameraIcon, RefreshCw, X } from 'lucide-react';

interface CameraProps {
  onCapture: (base64Image: string) => void;
  onClose: () => void;
  onError?: (error: string) => void;
}

export const Camera: React.FC<CameraProps> = ({ onCapture, onClose, onError }) => {
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [stream, setStream] = useState<MediaStream | null>(null);
  const [isFront, setIsFront] = useState(false);

  const startCamera = useCallback(async (front: boolean) => {
    if (stream) {
      stream.getTracks().forEach(track => track.stop());
    }

    try {
      const newStream = await navigator.mediaDevices.getUserMedia({
        video: { 
          facingMode: front ? 'user' : 'environment',
          width: { ideal: 1280 },
          height: { ideal: 720 }
        },
        audio: false
      });
      setStream(newStream);
      if (videoRef.current) {
        videoRef.current.srcObject = newStream;
      }
    } catch (err) {
      console.error("Error accessing camera:", err);
      if (onError) {
        onError("カメラへのアクセスに失敗しました。ブラウザの設定で許可されているか確認してください。");
      }
    }
  }, [stream]);

  React.useEffect(() => {
    startCamera(isFront);
    return () => {
      if (stream) {
        stream.getTracks().forEach(track => track.stop());
      }
    };
  }, []);

  const capture = () => {
    if (videoRef.current && canvasRef.current) {
      const video = videoRef.current;
      const canvas = canvasRef.current;
      canvas.width = video.videoWidth;
      canvas.height = video.videoHeight;
      const ctx = canvas.getContext('2d');
      if (ctx) {
        ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
        const dataUrl = canvas.toDataURL('image/jpeg');
        onCapture(dataUrl);
      }
    }
  };

  const toggleCamera = () => {
    const nextFront = !isFront;
    setIsFront(nextFront);
    startCamera(nextFront);
  };

  return (
    <div className="fixed inset-0 z-50 bg-black flex flex-col">
      <div className="flex justify-between p-4 text-white">
        <button onClick={onClose} className="p-2 bg-white/10 rounded-full">
          <X size={24} />
        </button>
        <button onClick={toggleCamera} className="p-2 bg-white/10 rounded-full">
          <RefreshCw size={24} />
        </button>
      </div>

      <div className="flex-1 relative overflow-hidden flex items-center justify-center">
        <video
          ref={videoRef}
          autoPlay
          muted
          playsInline
          className="w-full h-full object-cover"
        />
      </div>

      <div className="p-8 flex justify-center bg-black">
        <button
          onClick={capture}
          className="w-20 h-20 rounded-full border-4 border-white flex items-center justify-center bg-white/20 active:scale-95 transition-transform"
        >
          <div className="w-16 h-16 rounded-full bg-white" />
        </button>
      </div>

      <canvas ref={canvasRef} className="hidden" />
    </div>
  );
};
