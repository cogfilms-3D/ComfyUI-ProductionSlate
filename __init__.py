from .ProductionSlateV4_3 import (
    ProductionSlateV4_3,
)

from .ProductionSlateV4_Build004C_Image import (
    ProductionSlateV4_Build004C_Image,
)

from .ProductionSlateV4_Build004C_Video import (
    ProductionSlateV4_Build004C_Video,
)

from .production_slate_load_latent import ProductionSlateLoadLatent

from . import production_slate_browse


NODE_CLASS_MAPPINGS = {
    "ProductionSlateV4":
        ProductionSlateV4_3,

    "ProductionSlateLoadLatent":
        ProductionSlateLoadLatent,

    "ProductionSlateV4_Build004C_Image":
        ProductionSlateV4_Build004C_Image,

    "ProductionSlateV4_Build004C_Video":
        ProductionSlateV4_Build004C_Video,
}

NODE_DISPLAY_NAME_MAPPINGS = {
    "ProductionSlateV4":
        "🎬 Production Slate V4.5",

    "ProductionSlateLoadLatent":
        "🎬 Production Slate — Load Latent",

    "ProductionSlateV4_Build004C_Image":
        "🎬 Production Slate V4 — IMAGE 004-C",

    "ProductionSlateV4_Build004C_Video":
        "🎬 Production Slate V4 — VIDEO 004-C",
}

WEB_DIRECTORY = "./web"

__all__ = [
    "NODE_CLASS_MAPPINGS",
    "NODE_DISPLAY_NAME_MAPPINGS",
]