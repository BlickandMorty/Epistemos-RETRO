use serde::Serialize;
use storage::error::StorageError;

#[derive(Debug, thiserror::Error)]
#[allow(dead_code)]
pub enum AppError {
    #[error(transparent)]
    Storage(#[from] StorageError),
    #[error("not implemented: {0}")]
    NotImplemented(String),
    #[error("internal error: {0}")]
    Internal(String),
}

impl Serialize for AppError {
    fn serialize<S: serde::Serializer>(&self, s: S) -> Result<S::Ok, S::Error> {
        use serde::ser::SerializeMap;
        let kind = match self {
            Self::Storage(StorageError::PageNotFound(_)) => "not_found",
            Self::Storage(StorageError::Database(_)) => "database",
            Self::Storage(_) => "storage",
            Self::NotImplemented(_) => "not_implemented",
            Self::Internal(_) => "internal",
        };
        let mut map = s.serialize_map(Some(2))?;
        map.serialize_entry("kind", kind)?;
        map.serialize_entry("message", &self.to_string())?;
        map.end()
    }
}

impl specta::Type for AppError {
    fn inline(
        _type_map: &mut specta::TypeCollection,
        _generics: specta::Generics,
    ) -> specta::datatype::DataType {
        // AppError serializes as { kind: string, message: string }
        // We use Any here because the struct fields in specta's DataType are pub(crate).
        // The actual shape is enforced by our Serialize impl.
        specta::datatype::DataType::Any
    }
}
