interface PortraitModalProps {
  image: string
  character: string
  onClose: () => void
}

export default function PortraitModal({ image, character, onClose }: PortraitModalProps) {
  return (
    <div
      className="fixed inset-0 bg-black flex items-center justify-center z-50 cursor-pointer"
      onClick={onClose}
    >
      <img
        src={image}
        alt={character}
        className="h-screen w-auto object-contain cursor-pointer"
        onClick={onClose}
      />
    </div>
  )
}
