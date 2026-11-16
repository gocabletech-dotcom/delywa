-- Los pedidos anteriores a v2.33.0 no tenían código de seguimiento y su enlace abría sin él.
-- Se les pone uno al azar; desde ahora el seguimiento siempre exige el código. No borra nada.
UPDATE `pedidos` SET `codigo_seguimiento` = lower(hex(randomblob(8))) WHERE `codigo_seguimiento` IS NULL OR `codigo_seguimiento` = '';
